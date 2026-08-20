
  ┌──────────────────────┬─────────────────────────┬───────────────┬──────────────────────┬────────────────────────────────────────┐
  │        Limit         │    Where configured     │    Default    │    Configurable?     │         Behavior when exceeded         │
  ├──────────────────────┼─────────────────────────┼───────────────┼──────────────────────┼────────────────────────────────────────┤
  │ indexed_chars (chars │ Ingest pipeline —       │               │                      │ Truncates silently — document indexed, │
  │  extracted from PDF) │ attachment processor    │ 100,000 chars │ Yes, per processor   │  content cut off; content_length &gt;  │
  │                      │                         │               │                      │ actual content length                  │
  ├──────────────────────┼─────────────────────────┼───────────────┼──────────────────────┼────────────────────────────────────────┤
  │ Connector file size  │ Connector service       │ 10 MB         │ Yes, via self-hosted │ Skips content — document indexed, body │
  │ limit                │ (self-managed)          │               │  extraction service  │  field empty; metadata preserved       │
  ├──────────────────────┼─────────────────────────┼───────────────┼──────────────────────┼────────────────────────────────────────┤
  │ Elasticsearch HTTP   │ elasticsearch.yml —     │ 100 MB        │ Yes                  │ Hard failure — HTTP 413, entire        │
  │ body max             │ node level              │               │                      │ request rejected, nothing indexed      │
  ├──────────────────────┼─────────────────────────┼───────────────┼──────────────────────┼────────────────────────────────────────┤
  │ Elasticsearch        │ Elasticsearch core —    │ 100 MB        │ No                   │ Hard failure — HTTP 413, cannot be     │
  │ absolute hard limit  │ not configurable        │               │                      │ raised                                 │
  ├──────────────────────┼─────────────────────────┼───────────────┼──────────────────────┼────────────────────────────────────────┤
  │ ignore_above on      │                         │ 256 chars     │ Yes, or map field as │ Silently drops from index — value      │
  │ dynamic keyword      │ Index mapping           │ (dynamic      │  text                │ stays in _source but is unsearchable   │
  │ fields               │                         │ mapping)      │                      │                                        │
  └──────────────────────┴─────────────────────────┴───────────────┴──────────────────────┴────────────────────────────────────────┘
