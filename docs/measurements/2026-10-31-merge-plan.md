# Merge plan, 100k in memory

Date: 2026-10-31. Command:

```
cargo test -p braian-merge --offline -- --nocapture plans_one_hundred_thousand
```

The test plans the same source object 100 000 times against one master key.
It does not read Postgres and it does not write. The build is the debug
profile, not `--release`.

| plans | elapsed |
| --- | --- |
| 100 000 | 366 ms |

That is the cost of `braian_merge::plan` on this machine. A run that loads
objects from Postgres is a different measurement and is not in this file.
