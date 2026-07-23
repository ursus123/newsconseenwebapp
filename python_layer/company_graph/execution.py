"""Shared bounded executor for graph-related network I/O.

Persistent workers retain their thread-local Supabase HTTP sessions, avoiding a
new DNS/TCP/TLS setup every time an overview or search request is handled.
"""
from concurrent.futures import ThreadPoolExecutor


GRAPH_IO_WORKERS = 12
GRAPH_IO_EXECUTOR = ThreadPoolExecutor(max_workers=GRAPH_IO_WORKERS, thread_name_prefix="company-graph-io")
