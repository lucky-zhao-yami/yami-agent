#!/usr/bin/env python3
"""Kibana/Elasticsearch 日志查询脚本"""

import json
import urllib.request
import argparse
from datetime import datetime, timedelta

ES_URL = "http://elasticsearch.yamibuy.net"


def parse_datetime(dt_str: str) -> str:
    """解析日期时间字符串，支持多种格式，转为 ES 格式"""
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
        try:
            dt = datetime.strptime(dt_str, fmt)
            # 输入视为本地时间(UTC+8)，转为 UTC
            dt = dt - timedelta(hours=8)
            return dt.strftime("%Y-%m-%dT%H:%M:%S.000Z")
        except ValueError:
            continue
    raise ValueError(f"无法解析时间: {dt_str}，支持格式: YYYY-MM-DD HH:MM:SS / YYYY-MM-DD HH:MM / YYYY-MM-DD")


def parse_time_range(time_range: str = None, start_time: str = None, end_time: str = None) -> tuple:
    """解析时间范围，支持相对时间和绝对时间段"""
    if start_time:
        start = parse_datetime(start_time)
        end = parse_datetime(end_time) if end_time else datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S.000Z")
        return start, end
    
    time_range = time_range or "1h"
    now = datetime.utcnow()
    unit = time_range[-1]
    value = int(time_range[:-1])
    
    if unit == 'm':
        delta = timedelta(minutes=value)
    elif unit == 'h':
        delta = timedelta(hours=value)
    elif unit == 'd':
        delta = timedelta(days=value)
    else:
        delta = timedelta(hours=1)
    
    start = (now - delta).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    end = now.strftime("%Y-%m-%dT%H:%M:%S.000Z")
    return start, end


def es_search(index: str, query: dict, size: int = 100) -> dict:
    """执行 ES 搜索"""
    url = f"{ES_URL}/{index}/_search"
    data = json.dumps({"query": query, "size": size, "sort": [{"@timestamp": "desc"}]}).encode()
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())


def format_logs(hits: list) -> str:
    """格式化日志输出"""
    if not hits:
        return "未找到匹配的日志"
    
    lines = []
    for hit in hits:
        src = hit["_source"]
        ts = src.get("logdate", src.get("@timestamp", ""))
        msg = src.get("message", "")
        if len(msg) > 500:
            msg = msg[:500] + "..."
        lines.append(f"[{ts}] {msg}")
    
    return f"找到 {len(hits)} 条日志:\n\n" + "\n".join(lines)


def search_logs(service: str, keyword: str, time_range: str = "1h", limit: int = 50, start_time: str = None, end_time: str = None) -> str:
    """搜索服务日志"""
    start, end = parse_time_range(time_range, start_time, end_time)
    index = f"k8s-{service}-log-*"
    
    query = {
        "bool": {
            "must": [
                {"match_phrase": {"message": keyword}},
                {"range": {"@timestamp": {"gte": start, "lte": end}}}
            ]
        }
    }
    
    result = es_search(index, query, limit)
    return format_logs(result.get("hits", {}).get("hits", []))


def search_errors(service: str = None, time_range: str = "1h", limit: int = 30, start_time: str = None, end_time: str = None) -> str:
    """搜索错误日志"""
    start, end = parse_time_range(time_range, start_time, end_time)
    index = f"k8s-{service}-log-*" if service else "k8s-*-log-*"
    
    query = {
        "bool": {
            "must": [
                {"match": {"message": "ERROR"}},
                {"range": {"@timestamp": {"gte": start, "lte": end}}}
            ]
        }
    }
    
    result = es_search(index, query, limit)
    return format_logs(result.get("hits", {}).get("hits", []))


def search_by_order(order_sn: str, service: str = None, time_range: str = "7d", limit: int = 100, start_time: str = None, end_time: str = None) -> str:
    """按订单号搜索日志"""
    start, end = parse_time_range(time_range, start_time, end_time)
    index = f"k8s-{service}-log-*" if service else "k8s-*-so-*-log-*,k8s-*-rma-*-log-*"
    
    query = {
        "bool": {
            "must": [
                {"match_phrase": {"message": order_sn}},
                {"range": {"@timestamp": {"gte": start, "lte": end}}}
            ]
        }
    }
    
    result = es_search(index, query, limit)
    return format_logs(result.get("hits", {}).get("hits", []))


def list_services() -> str:
    """列出所有可用的服务"""
    url = f"{ES_URL}/_cat/indices?h=index&format=json"
    with urllib.request.urlopen(url, timeout=10) as resp:
        indices = json.loads(resp.read())
    
    services = set()
    for idx in indices:
        name = idx.get("index", "")
        if name.startswith("k8s-") and "-log-" in name:
            parts = name.replace("k8s-", "").split("-log-")[0]
            services.add(parts)
    
    return "可用服务:\n" + "\n".join(sorted(services))


def main():
    parser = argparse.ArgumentParser(description="Kibana 日志查询")
    parser.add_argument("--service", "-s", help="服务名")
    parser.add_argument("--keyword", "-k", help="搜索关键词")
    parser.add_argument("--order", "-o", help="订单号")
    parser.add_argument("--errors", "-e", action="store_true", help="只搜索错误日志")
    parser.add_argument("--time-range", "-t", default="1h", help="时间范围 (15m/1h/24h/7d)")
    parser.add_argument("--start", help="开始时间 (YYYY-MM-DD HH:MM:SS)")
    parser.add_argument("--end", help="结束时间 (YYYY-MM-DD HH:MM:SS)，不填则到当前")
    parser.add_argument("--limit", "-l", type=int, default=50, help="返回条数")
    parser.add_argument("--list-services", action="store_true", help="列出所有服务")
    
    args = parser.parse_args()
    
    try:
        if args.list_services:
            print(list_services())
        elif args.order:
            print(search_by_order(args.order, args.service, args.time_range, args.limit, args.start, args.end))
        elif args.errors:
            print(search_errors(args.service, args.time_range, args.limit, args.start, args.end))
        elif args.keyword and args.service:
            print(search_logs(args.service, args.keyword, args.time_range, args.limit, args.start, args.end))
        else:
            parser.print_help()
    except Exception as e:
        print(f"查询失败: {e}")


if __name__ == "__main__":
    main()
