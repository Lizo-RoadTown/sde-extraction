---
title: Get the data (public API)
description: A read-only public endpoint that serves every extracted model and its paper bibliography, no sign-in needed.
---

Every extracted model is available from a read-only public endpoint. Anyone can read it, no account
needed. You cannot change anything through it, it only returns data.

## The endpoint

```
https://sohimlkvueagelulsrgi.supabase.co/rest/v1/public_models
```

Every request needs the public key in an `apikey` header. This key is public and safe to share:

```
sb_publishable_C-b7BhAhbeQ-2kXvX7HQgA_qHYLfxqu
```

## What you get back

Each record is one extracted model with its paper details:

| Field | Meaning |
| --- | --- |
| `id` | the extraction's unique id |
| `paper_id` | the source paper's id |
| `title` | the paper title |
| `figure_label` | the figure the model was read from |
| `pathogen` | the disease the model is about |
| `doi` | the paper's DOI |
| `formulation_family` | the kind of SDE formulation |
| `status` | where the result is in review |
| `figure_reproduced` | whether re-simulating the model reproduced the figure |
| `model` | the full extracted model (variables, parameters, terms) |
| `created_at`, `updated_at` | timestamps |

Internal review notes, telemetry, and file storage paths are never exposed.

## Read it in the browser or with curl

```bash
curl "https://sohimlkvueagelulsrgi.supabase.co/rest/v1/public_models?select=*&limit=5" \
  -H "apikey: sb_publishable_C-b7BhAhbeQ-2kXvX7HQgA_qHYLfxqu"
```

## Read it from Python

```python
import requests

URL = "https://sohimlkvueagelulsrgi.supabase.co/rest/v1/public_models"
KEY = "sb_publishable_C-b7BhAhbeQ-2kXvX7HQgA_qHYLfxqu"

resp = requests.get(URL, headers={"apikey": KEY}, params={"select": "*", "limit": 5})
models = resp.json()
```

## Read it from JavaScript

```js
const URL = "https://sohimlkvueagelulsrgi.supabase.co/rest/v1/public_models";
const KEY = "sb_publishable_C-b7BhAhbeQ-2kXvX7HQgA_qHYLfxqu";

const res = await fetch(`${URL}?select=*&limit=5`, { headers: { apikey: KEY } });
const models = await res.json();
```

## Ask for just what you need

The endpoint follows the [PostgREST](https://postgrest.org/en/stable/references/api.html) query
style, so you can pick columns and filter without downloading everything:

```bash
# only the bibliography columns
...?select=title,pathogen,doi,figure_reproduced

# only models for a given pathogen
...?pathogen=eq.Cholera

# only results that reproduced the figure
...?figure_reproduced=is.true

# page through results
...?limit=20&offset=40
```

This endpoint is read-only. Adding a paper and checking a result is done in the app, see
[Add a paper and check it](/how-to/add-and-verify/).
