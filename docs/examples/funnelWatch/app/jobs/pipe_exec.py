"""Shared pipe interpreter: apply a spec's op-list to rows with pandas.

One source of truth for pipe semantics, run in two places:
  * in the workbench sandbox — this module's source is shipped inline and run over mount
    event data (``app.pipe`` mount sources);
  * in-process on the host — imported directly and run over durable/local rows (which the
    sandbox can't reach).

Self-contained: imports nothing from ``app`` (it must run inside the sandbox VM).
"""
import json

import pandas as pd


def run(rows, ops):
    df = pd.DataFrame(rows)
    for op in ops:
        df = _apply(df, op)
    return json.loads(df.to_json(orient="records"))


def _apply(df, op):
    kind = op["op"]
    if kind == "where":
        for col, val in op["eq"].items():
            df = df[df[col].astype(str) == str(val)] if col in df.columns else df.iloc[0:0]
        return df
    if kind == "select":
        return df[[c for c in op["cols"] if c in df.columns]]
    if kind == "agg":
        return _apply_agg(df, op["by"], op["agg"])
    if kind == "sort":
        cols = [c for c in op["cols"] if c in df.columns]
        return df.sort_values(cols, ascending=not op["desc"]) if cols else df
    if kind == "head":
        return df.head(int(op["n"]))
    return df


def _apply_agg(df, by, aggs):
    if not len(df):
        return pd.DataFrame()
    named, size_cols = {}, []
    for name, (col, func) in aggs.items():
        size_cols.append(name) if func == "size" else named.__setitem__(name, (col, func))
    if by:
        if any(c not in df.columns for c in by):
            return pd.DataFrame()
        g = df.groupby(by, dropna=False)
        out = g.agg(**named) if named else pd.DataFrame(index=g.size().index)
        for name in size_cols:
            out[name] = g.size()
        return out.reset_index()
    row = {name: (getattr(df[col], func)() if col in df.columns else None)
           for name, (col, func) in named.items()}
    for name in size_cols:
        row[name] = len(df)
    return pd.DataFrame([row])
