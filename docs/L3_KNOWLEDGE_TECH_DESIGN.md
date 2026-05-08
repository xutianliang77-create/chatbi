# L3 Knowledge 技术设计

## 1. 目标

L3 Knowledge 是 CodeClaw 的长期知识检索层，目标是给 LLM 提供短小、可追溯、按需调用的证据包，而不是把历史、索引或外部元数据自动塞进每次 provider prompt。

当前统一入口是 native tool：

```text
knowledge_search
```

它聚合三类本地证据：

1. RAG：代码/文档 chunk。
2. Graph：CodebaseGraph symbol、import、call 关系。
3. Beelink：本地 `metadata.db`、`semantic-layer.json`、`glossary.md`。

## 2. 非目标

- 不替代 L1 transcript。
- 不替代 L2 memory digest。
- 不直接执行 SQL。
- 不实时探查 Dremio。
- 不自动注入 provider 上下文。
- 不删除旧 `rag_search` / `graph_query`，它们保留兼容。

## 3. 用户/LLM 使用方式

LLM 只有在需要长期知识时才调用：

```json
{
  "query": "sales_amount 销售金额 sample_sales_daily",
  "mode": "auto",
  "sources": ["rag", "graph", "beelink"],
  "topK": 8
}
```

参数：

- `query`: 自然语言、文件路径、符号名、业务字段或数据表线索。
- `topK`: 默认 8，最大 20。
- `mode`: `auto | rag | graph | beelink`。
- `sources`: 仅在 `auto` 下作为显式来源过滤，支持 `rag | graph | beelink` 组合。

## 4. 数据源

### 4.1 RAG

来源：

```text
~/.codeclaw/projects/<workspace-hash>/rag.db
```

前置命令：

```text
/rag index
/rag embed
```

当前 `knowledge_search` 使用 BM25 keyword 搜索，并保留 chunk provenance：

- `chunkId`
- `filePath`
- `lineStart`
- `lineEnd`
- retrieval method

### 4.2 Graph

来源同 RAG database 中的 CodebaseGraph tables。

前置命令：

```text
/graph build
```

支持意图：

- 谁调用某符号。
- 某文件调用了什么。
- 谁依赖某文件。
- 某文件依赖什么。
- 某文件包含哪些 symbol。
- 按 symbol 名检索。

### 4.3 Beelink Local Knowledge

来源：

```text
~/.codeclaw/projects/<workspace-hash>/beelink/
  metadata.db
  semantic-layer.json
  glossary.md
```

环境变量覆盖：

- `BEELINK_METADATA_DB`
- `BEELINK_SEMANTIC_LAYER`
- `BEELINK_GLOSSARY`

Beelink hits 类型：

- `semantic_metric`
- `semantic_entity`
- `glossary`
- `metadata_object`
- `metadata_column`

重要边界：

- 只读本地文件。
- 不调用 Dremio。
- 不调用 Beelink MCP live probing。
- 不生成 SQL。

## 5. 检索与合并

`mode=auto` 默认启用所有可用来源。合并策略：

1. 各来源先独立检索。
2. 对路径、文件名、反引号符号和标识符做轻量 deterministic rerank。
3. 多来源可用且 `topK >= 2` 时执行 balanced merge，尽量保留跨源证据。
4. 按最终 score 排序并去重。

Rerank provenance：

- `baseScore`
- `rerankBoost`
- `rerankReasons`

## 6. 输出契约

`KnowledgeSearchResult`：

```ts
interface KnowledgeSearchResult {
  hits: KnowledgeHit[];
  text: string;
  diagnostics: {
    ragAvailable: boolean;
    graphAvailable: boolean;
    beelinkAvailable: boolean;
    ragHits: number;
    graphHits: number;
    beelinkHits: number;
    enabledSources: Array<"rag" | "graph" | "beelink">;
  };
}
```

每个 hit 必须包含：

- `source`
- `title`
- `excerpt`
- `score`
- `provenance`

文件型证据应尽量包含：

- `filePath`
- `lineStart`
- `lineEnd`

## 7. Context 边界

L3 只返回短证据包，不能返回大段全文或完整 artifact。大结果应留在：

- RAG DB
- Graph DB
- Beelink metadata files
- artifact 文件

Provider prompt 中只应出现：

- 命中摘要
- 必要 excerpt
- provenance

如果 LLM 需要全文，应再调用 `read` / `read_artifact` 等明确工具，而不是让 L3 自动扩展。

### 7.1 Source Budget

`knowledge_search` 的预算目标是“证据包”，不是“全文召回”。当前硬边界：

- `topK` 默认 8，最大 20。
- 每个 hit 只返回短 excerpt 和 provenance。
- `mode=auto` 会做 balanced merge，避免 RAG、Graph 或 Beelink 单一来源占满全部结果。
- Beelink source 只读本地 `metadata.db` / `semantic-layer.json` / `glossary.md`，不触发 live probe。

后续需要补强但尚未实现的预算：

- 每来源独立 token cap，例如 RAG/Graph/Beelink 各自最多 N tokens。
- 每个 excerpt 的字符/token 上限显式配置。
- Web provenance 面板展示每个 source 的可用性、命中数和裁剪原因。

这些预算必须和 `RUNTIME_GUARDS_DESIGN.md` 中的 provider context hard gate 分层：L3 控制检索结果大小，Context Budget 控制最终 provider 输入大小。

### 7.2 Draft vs Reviewed Knowledge

Beelink 同步生成的 `semantic-layer.json` 和 `glossary.md` 是保守草稿。当前 L3 会把它们作为带 provenance 的本地证据返回，但不把它们升级为已审核业务真相。

缺口：

- 需要 schema 字段或 sidecar metadata 标记 `generated_draft | reviewed`。
- `knowledge_search` 应在 provenance 中展示该状态。
- SQL/report 结论中如果只依赖 draft semantic，应保留 caveat。

## 8. 与 Beelink MCP 的关系

L3 Beelink source 是本地知识检索，不是 Beelink MCP live workflow。

推荐 SQL 上下文顺序：

1. 当前对话和 L2 recall。
2. `knowledge_search mode=beelink` 查本地语义/元数据。
3. Beelink MCP `BuildSqlGuidance` 获取规则与更完整 SQL guidance。
4. LLM 生成 SQL。
5. Beelink MCP `CheckSqlAgainstRules`。
6. Beelink MCP `RunSqlQuery`。

## 9. 已实现

- `src/knowledge/types.ts`
- `src/knowledge/search.ts`
- `src/knowledge/beelink.ts`
- `src/agent/tools/knowledgeTool.ts`
- `knowledge_search` 注册到 QueryEngine。
- `mode=auto|rag|graph|beelink`。
- `sources=["rag"|"graph"|"beelink"]`。
- balanced merge。
- deterministic rerank。
- Beelink local semantic/metadata hits。
- 单元测试覆盖 RAG、Graph、Beelink、source filter、rerank。

## 10. 剩余 TODO

1. Web/RAG 页面展示 L3 source status。
2. 为 `knowledge_search` 增加 Web 可视化 provenance 面板。
3. 真实 Web smoke：确认数据/元数据问题优先用 L3 evidence，而不是直接执行 SQL。
4. 可选：把 reviewed semantic knowledge 与 generated draft knowledge 分级展示。
5. 可选：为 Beelink metadata stale 状态加入 last synced 提示。
