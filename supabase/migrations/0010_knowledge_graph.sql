-- Knowledge-graph projection (ADR 0008; contract = services/extraction/graph.py).
-- Two READ-ONLY views the UI reads directly: graph_node + graph_edge. Nothing computes the graph on
-- the fly; this IS the projection over papers / extractions / entity_tag. Additive, no new state.
--
-- What projects TODAY (from columns that already exist): paper -> model (contains), model -> pathogen
-- (about-pathogen), model -> model-family (has-family). The entity_tag branches (roles, authors,
-- attached-to, ...) are correct but empty until the tag producer writes entity_tag rows, and until
-- variables/parameters are surfaced from extractions.model jsonb as their own nodes.
--
-- node id convention: '<kind>:<key>'  (e.g. 'pathogen:dengue', 'model:<uuid>'). Mirrors graph.py.

create or replace view graph_node as
  -- backbone: papers
  select 'paper:'  || p.id::text          as id, 'paper'  as kind,
         coalesce(nullif(p.title, ''), p.filename, 'paper') as label
    from papers p
  union
  -- backbone: models (one extraction = one (paper, figure) model)
  select 'model:'  || e.id::text          as id, 'model'  as kind,
         coalesce(nullif(e.figure_label, ''), 'model') as label
    from extractions e
  union
  -- shared-dimension nodes that already exist as columns
  select distinct 'pathogen:' || e.pathogen, 'pathogen', e.pathogen
    from extractions e where e.pathogen is not null and e.pathogen <> ''
  union
  select distinct 'model-family:' || e.formulation_family, 'model-family', e.formulation_family
    from extractions e where e.formulation_family is not null and e.formulation_family <> ''
  union
  -- shared-dimension nodes from tags (empty until the producer runs)
  select distinct t.facet_key || ':' || t.value, t.facet_key, t.value
    from entity_tag t
   where t.facet_key in ('variable-role','parameter-role','author','affiliation','domain','field',
                         'pathogen','model-family')
     and t.value <> '';

create or replace view graph_edge as
  -- paper contains model
  select 'paper:' || e.paper_id::text as source, 'model:' || e.id::text as target, 'contains' as type
    from extractions e where e.paper_id is not null
  union all
  -- model about pathogen
  select 'model:' || e.id::text, 'pathogen:' || e.pathogen, 'about-pathogen'
    from extractions e where e.pathogen is not null and e.pathogen <> ''
  union all
  -- model has family
  select 'model:' || e.id::text, 'model-family:' || e.formulation_family, 'has-family'
    from extractions e where e.formulation_family is not null and e.formulation_family <> ''
  union all
  -- tag-driven edges: a tagged piece -> the shared-dimension node it points at.
  -- entity_tag.entity_kind/entity_id name the source node; facet_key picks the edge type.
  select t.entity_kind || ':' || t.entity_id,
         t.facet_key || ':' || t.value,
         case t.facet_key
           when 'variable-role'  then 'has-role'
           when 'parameter-role' then 'has-role'
           when 'author'         then 'authored-by'
           when 'affiliation'    then 'affiliated-with'
           when 'domain'         then 'in-domain'
           when 'field'          then 'in-field'
           when 'pathogen'       then 'about-pathogen'
           when 'model-family'   then 'has-family'
           when 'attached-to'    then 'attached-to'
         end
    from entity_tag t
   where t.value <> ''
     and t.facet_key in ('variable-role','parameter-role','author','affiliation','domain','field',
                         'pathogen','model-family','attached-to');

-- Views inherit the base tables' RLS (security_invoker keeps the caller's row policies in force).
alter view graph_node set (security_invoker = true);
alter view graph_edge set (security_invoker = true);
