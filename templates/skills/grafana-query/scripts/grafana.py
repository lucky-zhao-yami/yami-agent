"""Grafana 查询工具 - 告警规则、Dashboard、数据源查询"""
import argparse, json, os, ssl, sys, urllib.request, urllib.parse

GRAFANA_URL = os.getenv("GRAFANA_URL", "https://grafana.yamibuy.com").rstrip("/")
GRAFANA_TOKEN = os.getenv("GRAFANA_TOKEN", "glsa_y3yRQjT6OUlS4iHkAIY1YCuvX055ZW3v_d1fccc25")

_ctx = ssl.create_default_context()


def _api(path, method="GET", body=None):
    url = f"{GRAFANA_URL}{path}"
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, method=method, headers={
        "Authorization": f"Bearer {GRAFANA_TOKEN}",
        "Content-Type": "application/json",
    })
    with urllib.request.urlopen(req, timeout=30, context=_ctx) as resp:
        return json.loads(resp.read())


def cmd_alert_rules(args):
    groups = _api("/api/ruler/grafana/api/v1/rules")
    for folder, rgs in groups.items():
        for rg in rgs:
            for rule in rg.get("rules", []):
                ga = rule.get("grafana_alert", {})
                title = ga.get("title", "")
                if args.keyword and args.keyword.lower() not in title.lower():
                    continue
                queries = []
                for d in ga.get("data", []):
                    m = d.get("model", {})
                    q = m.get("rawSql") or m.get("expr", "")
                    if q:
                        queries.append({"refId": d.get("refId"), "datasourceUid": d.get("datasourceUid"), "query": q})
                print(json.dumps({
                    "folder": folder, "group": rg.get("name"),
                    "title": title, "uid": ga.get("uid"),
                    "queries": queries,
                }, ensure_ascii=False, indent=2))
                print()


def cmd_firing(args):
    try:
        alerts = _api("/api/alertmanager/grafana/api/v2/alerts?active=true")
        print(json.dumps(alerts, ensure_ascii=False, indent=2))
    except Exception as e:
        print(f"获取失败: {e}", file=sys.stderr)


def cmd_datasources(args):
    ds = _api("/api/datasources")
    for d in ds:
        print(f"{d['uid']:40s} {d['type']:30s} {d['name']}")


def cmd_search_dashboard(args):
    params = urllib.parse.urlencode({"query": args.query, "type": "dash-db", "limit": 20})
    results = _api(f"/api/search?{params}")
    for d in results:
        print(f"{d['uid']:40s} {d['title']}")


def cmd_dashboard_panels(args):
    result = _api(f"/api/dashboards/uid/{args.uid}")
    panels = result.get("dashboard", {}).get("panels", [])
    for p in panels:
        _print_panel(p)
        for sp in p.get("panels", []):
            _print_panel(sp)


def _print_panel(p):
    title = p.get("title", "")
    targets = p.get("targets", [])
    queries = [t.get("rawSql") or t.get("expr", "") for t in targets if t.get("rawSql") or t.get("expr")]
    if queries:
        print(f"=== {title} (id:{p.get('id')}) ===")
        for q in queries:
            ds = targets[0].get("datasource", {}).get("uid", "") if targets else ""
            print(f"  datasource: {ds}")
            print(f"  {q}")
            print()


def cmd_query(args):
    body = {
        "queries": [{
            "refId": "A",
            "datasource": {"uid": args.datasource},
            "rawSql": args.sql,
            "format": "table",
        }],
        "from": f"now-{args.time_range}",
        "to": "now",
    }
    result = _api("/api/ds/query", method="POST", body=body)
    frames = result.get("results", {}).get("A", {}).get("frames", [])
    rows = []
    for f in frames:
        cols = [c.get("name", "") for c in f.get("schema", {}).get("fields", [])]
        vals = f.get("data", {}).get("values", [])
        if vals and vals[0]:
            for i in range(len(vals[0])):
                rows.append({cols[j]: vals[j][i] for j in range(len(cols))})
    print(json.dumps(rows[:200], ensure_ascii=False, indent=2) if rows else json.dumps(result, ensure_ascii=False, indent=2))


def main():
    p = argparse.ArgumentParser(
        description="Grafana 查询工具 - 告警规则、Dashboard、数据源查询",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""示例:
  %(prog)s alert-rules                          列出所有告警规则及监控 SQL
  %(prog)s alert-rules -k "Braintree"           按关键词筛选告警规则
  %(prog)s firing                               查看当前正在触发的告警
  %(prog)s datasources                          列出所有数据源 UID
  %(prog)s search-dashboard "payment"           搜索 Dashboard
  %(prog)s dashboard-panels <dashboard-uid>     查看 Dashboard 所有面板及 SQL
  %(prog)s query <datasource-uid> "SELECT ..."  直接查询数据源

常用数据源 UID:
  fb3fdd0b-...  MySQL-G3 (生产)
  ee80fd88-...  MySQL-DEV
  b582c9d2-...  Prometheus""")
    sub = p.add_subparsers(dest="cmd", title="子命令")

    s1 = sub.add_parser("alert-rules", help="列出告警规则及其监控 SQL/PromQL")
    s1.add_argument("-k", "--keyword", default="", help="按告警名称关键词筛选")

    sub.add_parser("firing", help="列出当前正在触发（firing）的告警")
    sub.add_parser("datasources", help="列出所有数据源（UID、类型、名称）")

    s4 = sub.add_parser("search-dashboard", help="按关键词搜索 Dashboard")
    s4.add_argument("query", help="搜索关键词，如 payment、order")

    s5 = sub.add_parser("dashboard-panels", help="查看 Dashboard 的所有面板及其查询 SQL")
    s5.add_argument("uid", help="Dashboard UID（从 search-dashboard 获取）")

    s6 = sub.add_parser("query", help="直接查询 Grafana 数据源（执行 SQL）")
    s6.add_argument("datasource", help="数据源 UID（从 datasources 或告警规则获取）")
    s6.add_argument("sql", help="SQL 查询语句")
    s6.add_argument("-t", "--time-range", default="1h", help="时间范围，如 1h/6h/24h（默认 1h）")

    args = p.parse_args()
    if not args.cmd:
        p.print_help()
        return

    {"alert-rules": cmd_alert_rules, "firing": cmd_firing, "datasources": cmd_datasources,
     "search-dashboard": cmd_search_dashboard, "dashboard-panels": cmd_dashboard_panels,
     "query": cmd_query}[args.cmd](args)


if __name__ == "__main__":
    main()
