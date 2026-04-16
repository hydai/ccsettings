//! Cascade merge engine.
//!
//! Consumes a precedence-ordered slice of [`Layer`] values and produces a
//! [`MergedView`] — the effective merged JSON plus per-path origin
//! attribution.
//!
//! Merge rules (applied by JSON Pointer path):
//!
//! | Path pattern                                    | Rule         |
//! |-------------------------------------------------|--------------|
//! | `/hooks/<event>`                                | append       |
//! | `/permissions/{allow,deny,ask}`                 | union        |
//! | `/enabledMcpjsonServers`, `/disabledMcpjsonServers` | union    |
//! | object (any other path)                         | deep-merge   |
//! | array (any other path)                          | replace      |
//! | scalar (any other path)                         | later-wins   |
//!
//! Earlier layers have lower precedence; later layers override or merge.

use crate::layers::{Layer, LayerContent, LayerKind};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::BTreeMap;

/// One layer's contribution at a particular JSON Pointer path.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Contributor {
    pub layer: LayerKind,
    pub value: Value,
    /// True when a later-precedence layer superseded this value in the final
    /// merged output. Appended and unioned array items are never overridden.
    pub overridden: bool,
}

/// Result of merging N layers. `origins` maps a JSON Pointer (e.g.
/// `"/permissions/allow/0"`) to the ordered stack of contributors. The last
/// non-`overridden` entry at each leaf path is the effective source.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MergedView {
    pub value: Value,
    pub origins: BTreeMap<String, Vec<Contributor>>,
}

/// Merge layers in the order given (earliest = lowest precedence).
/// [`LayerContent::Absent`] and [`LayerContent::ParseError`] layers are
/// skipped and contribute nothing. Top-level non-object layers are also
/// skipped with a warning — `settings.json` is always an object by contract.
pub fn merge(layers: &[Layer]) -> MergedView {
    let mut value = Value::Object(Map::new());
    let mut origins: BTreeMap<String, Vec<Contributor>> = BTreeMap::new();

    for layer in layers {
        let src = match &layer.content {
            LayerContent::Parsed(v) => v,
            _ => continue,
        };
        if !src.is_object() {
            tracing::warn!(
                layer = layer.kind.as_str(),
                file = ?layer.file,
                "top-level value is not an object; skipping layer",
            );
            continue;
        }
        deep_merge_object(&mut value, src, layer, "", &mut origins);
    }

    MergedView { value, origins }
}

fn deep_merge_object(
    dst: &mut Value,
    src: &Value,
    layer: &Layer,
    path: &str,
    origins: &mut BTreeMap<String, Vec<Contributor>>,
) {
    let src_map = src
        .as_object()
        .expect("deep_merge_object: src must be object");
    let dst_map = dst
        .as_object_mut()
        .expect("deep_merge_object: dst must be object");

    for (k, v) in src_map {
        let sub_path = format!("{path}/{}", escape_json_pointer_segment(k));
        match dst_map.get_mut(k) {
            Some(existing) => apply_merge_rule(existing, v, layer, &sub_path, origins),
            None => {
                dst_map.insert(k.clone(), v.clone());
                record_subtree(origins, &sub_path, layer, v);
            }
        }
    }
}

fn apply_merge_rule(
    existing: &mut Value,
    src: &Value,
    layer: &Layer,
    path: &str,
    origins: &mut BTreeMap<String, Vec<Contributor>>,
) {
    if existing.is_object() && src.is_object() {
        deep_merge_object(existing, src, layer, path, origins);
        return;
    }

    if existing.is_array() && src.is_array() {
        if is_append_path(path) {
            append_array(existing, src, layer, path, origins);
            return;
        }
        if is_union_path(path) {
            union_array(existing, src, layer, path, origins);
            return;
        }
        // Fall through: replace.
    }

    mark_overridden_at_and_under(origins, path);
    *existing = src.clone();
    record_subtree(origins, path, layer, src);
}

fn append_array(
    existing: &mut Value,
    src: &Value,
    layer: &Layer,
    path: &str,
    origins: &mut BTreeMap<String, Vec<Contributor>>,
) {
    let src_arr = src.as_array().expect("append_array: src is array");
    let existing_arr = existing
        .as_array_mut()
        .expect("append_array: existing is array");
    for item in src_arr {
        let idx = existing_arr.len();
        existing_arr.push(item.clone());
        record_subtree(origins, &format!("{path}/{idx}"), layer, item);
    }
}

fn union_array(
    existing: &mut Value,
    src: &Value,
    layer: &Layer,
    path: &str,
    origins: &mut BTreeMap<String, Vec<Contributor>>,
) {
    let src_arr = src.as_array().expect("union_array: src is array");
    let existing_arr = existing
        .as_array_mut()
        .expect("union_array: existing is array");
    for item in src_arr {
        if existing_arr.iter().any(|x| x == item) {
            continue;
        }
        let idx = existing_arr.len();
        existing_arr.push(item.clone());
        record_subtree(origins, &format!("{path}/{idx}"), layer, item);
    }
}

fn record_subtree(
    origins: &mut BTreeMap<String, Vec<Contributor>>,
    path: &str,
    layer: &Layer,
    val: &Value,
) {
    origins
        .entry(path.to_string())
        .or_default()
        .push(Contributor {
            layer: layer.kind,
            value: val.clone(),
            overridden: false,
        });
    match val {
        Value::Object(m) => {
            for (k, v) in m {
                let sub = format!("{path}/{}", escape_json_pointer_segment(k));
                record_subtree(origins, &sub, layer, v);
            }
        }
        Value::Array(a) => {
            for (i, v) in a.iter().enumerate() {
                record_subtree(origins, &format!("{path}/{i}"), layer, v);
            }
        }
        _ => {}
    }
}

fn mark_overridden_at_and_under(origins: &mut BTreeMap<String, Vec<Contributor>>, path: &str) {
    let prefix = format!("{path}/");
    for (k, contributors) in origins.iter_mut() {
        if k == path || k.starts_with(&prefix) {
            for c in contributors.iter_mut() {
                c.overridden = true;
            }
        }
    }
}

fn is_append_path(path: &str) -> bool {
    if let Some(rest) = path.strip_prefix("/hooks/") {
        !rest.is_empty() && !rest.contains('/')
    } else {
        false
    }
}

fn is_union_path(path: &str) -> bool {
    matches!(
        path,
        "/permissions/allow"
            | "/permissions/deny"
            | "/permissions/ask"
            | "/enabledMcpjsonServers"
            | "/disabledMcpjsonServers"
    )
}

/// Escape a JSON object key for use as a JSON Pointer segment (RFC 6901).
fn escape_json_pointer_segment(s: &str) -> String {
    s.replace('~', "~0").replace('/', "~1")
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::path::PathBuf;

    fn mk_layer(kind: LayerKind, value: Value) -> Layer {
        Layer {
            kind,
            file: PathBuf::from(format!("/virtual/{}.json", kind.as_str())),
            content: LayerContent::Parsed(value),
            hash: Some([0u8; 32]),
        }
    }

    fn absent(kind: LayerKind) -> Layer {
        Layer {
            kind,
            file: PathBuf::from("/virtual/absent"),
            content: LayerContent::Absent,
            hash: None,
        }
    }

    fn parse_error(kind: LayerKind) -> Layer {
        Layer {
            kind,
            file: PathBuf::from("/virtual/broken"),
            content: LayerContent::ParseError("oops".into()),
            hash: Some([1u8; 32]),
        }
    }

    fn effective(origins: &BTreeMap<String, Vec<Contributor>>, path: &str) -> LayerKind {
        origins
            .get(path)
            .expect(path)
            .iter()
            .rev()
            .find(|c| !c.overridden)
            .expect("at least one non-overridden contributor")
            .layer
    }

    #[test]
    fn no_layers_yields_empty_object() {
        let m = merge(&[]);
        assert_eq!(m.value, json!({}));
        assert!(m.origins.is_empty());
    }

    #[test]
    fn absent_and_parse_error_layers_contribute_nothing() {
        let m = merge(&[absent(LayerKind::User), parse_error(LayerKind::Project)]);
        assert_eq!(m.value, json!({}));
        assert!(m.origins.is_empty());
    }

    #[test]
    fn single_layer_is_identity() {
        let layers = vec![mk_layer(LayerKind::User, json!({"model": "opus"}))];
        let m = merge(&layers);
        assert_eq!(m.value, json!({"model": "opus"}));
        assert_eq!(effective(&m.origins, "/model"), LayerKind::User);
    }

    #[test]
    fn disjoint_scalars_from_two_layers_both_kept() {
        let m = merge(&[
            mk_layer(LayerKind::User, json!({"model": "opus"})),
            mk_layer(LayerKind::Project, json!({"outputStyle": "learning"})),
        ]);
        assert_eq!(m.value, json!({"model": "opus", "outputStyle": "learning"}));
        assert_eq!(effective(&m.origins, "/model"), LayerKind::User);
        assert_eq!(effective(&m.origins, "/outputStyle"), LayerKind::Project);
    }

    #[test]
    fn scalar_later_layer_overrides_earlier() {
        let m = merge(&[
            mk_layer(LayerKind::User, json!({"model": "sonnet"})),
            mk_layer(LayerKind::Project, json!({"model": "opus"})),
        ]);
        assert_eq!(m.value, json!({"model": "opus"}));
        let stack = m.origins.get("/model").unwrap();
        assert_eq!(stack.len(), 2);
        assert!(stack[0].overridden, "user should be overridden by project");
        assert!(!stack[1].overridden);
        assert_eq!(stack[0].layer, LayerKind::User);
        assert_eq!(stack[1].layer, LayerKind::Project);
    }

    #[test]
    fn objects_deep_merge() {
        let m = merge(&[
            mk_layer(LayerKind::User, json!({"env": {"A": "1", "B": "u"}})),
            mk_layer(LayerKind::Project, json!({"env": {"B": "p", "C": "3"}})),
        ]);
        assert_eq!(m.value, json!({"env": {"A": "1", "B": "p", "C": "3"}}));
        assert_eq!(effective(&m.origins, "/env/A"), LayerKind::User);
        assert_eq!(effective(&m.origins, "/env/B"), LayerKind::Project);
        assert_eq!(effective(&m.origins, "/env/C"), LayerKind::Project);
    }

    #[test]
    fn hooks_event_arrays_append_across_layers() {
        let m = merge(&[
            mk_layer(
                LayerKind::User,
                json!({"hooks": {"PreToolUse": [{"matcher": "Bash"}]}}),
            ),
            mk_layer(
                LayerKind::Project,
                json!({"hooks": {"PreToolUse": [{"matcher": "WebFetch"}]}}),
            ),
        ]);
        assert_eq!(
            m.value,
            json!({"hooks": {"PreToolUse": [
                {"matcher": "Bash"},
                {"matcher": "WebFetch"},
            ]}})
        );
        assert_eq!(
            effective(&m.origins, "/hooks/PreToolUse/0"),
            LayerKind::User
        );
        assert_eq!(
            effective(&m.origins, "/hooks/PreToolUse/1"),
            LayerKind::Project
        );
        assert_eq!(
            effective(&m.origins, "/hooks/PreToolUse/0/matcher"),
            LayerKind::User
        );
    }

    #[test]
    fn permissions_deny_unions_across_all_layers_and_dedupes() {
        let m = merge(&[
            mk_layer(
                LayerKind::User,
                json!({"permissions": {"deny": ["Bash(rm -rf *)", "WebFetch(*)"]}}),
            ),
            mk_layer(
                LayerKind::Project,
                json!({"permissions": {"deny": ["Bash(rm -rf *)", "Read(/etc/*)"]}}),
            ),
            mk_layer(
                LayerKind::ProjectLocal,
                json!({"permissions": {"deny": ["Read(/etc/*)"]}}),
            ),
        ]);
        let deny = m.value["permissions"]["deny"].as_array().unwrap();
        assert_eq!(deny.len(), 3);
        assert!(deny.contains(&json!("Bash(rm -rf *)")));
        assert!(deny.contains(&json!("WebFetch(*)")));
        assert!(deny.contains(&json!("Read(/etc/*)")));
        assert_eq!(
            effective(&m.origins, "/permissions/deny/0"),
            LayerKind::User
        );
        assert_eq!(
            effective(&m.origins, "/permissions/deny/1"),
            LayerKind::User
        );
        assert_eq!(
            effective(&m.origins, "/permissions/deny/2"),
            LayerKind::Project
        );
    }

    #[test]
    fn permissions_allow_unions() {
        let m = merge(&[
            mk_layer(
                LayerKind::User,
                json!({"permissions": {"allow": ["Bash(git *)"]}}),
            ),
            mk_layer(
                LayerKind::Project,
                json!({"permissions": {"allow": ["Bash(git *)", "WebFetch(*)"]}}),
            ),
        ]);
        let allow = m.value["permissions"]["allow"].as_array().unwrap();
        assert_eq!(allow.len(), 2);
    }

    #[test]
    fn default_arrays_are_replaced_not_merged() {
        // An array at a non-special path (e.g., /customArray) is replaced.
        let m = merge(&[
            mk_layer(LayerKind::User, json!({"customArray": [1, 2, 3]})),
            mk_layer(LayerKind::Project, json!({"customArray": [9]})),
        ]);
        assert_eq!(m.value["customArray"], json!([9]));
        // All original positions now overridden.
        assert!(m.origins["/customArray/0"]
            .iter()
            .all(|c| c.layer != LayerKind::User || c.overridden));
    }

    #[test]
    fn enabled_mcpjson_servers_unions() {
        let m = merge(&[
            mk_layer(
                LayerKind::User,
                json!({"enabledMcpjsonServers": ["a", "b"]}),
            ),
            mk_layer(
                LayerKind::Project,
                json!({"enabledMcpjsonServers": ["b", "c"]}),
            ),
        ]);
        let arr = m.value["enabledMcpjsonServers"].as_array().unwrap();
        assert_eq!(arr.len(), 3);
    }

    #[test]
    fn type_mismatch_triggers_replace_and_overridden_marking() {
        let m = merge(&[
            mk_layer(LayerKind::User, json!({"permissions": {"allow": ["A"]}})),
            // Project provides a scalar instead of object — replace whole branch.
            mk_layer(LayerKind::Project, json!({"permissions": "oops"})),
        ]);
        assert_eq!(m.value["permissions"], json!("oops"));
        let user_stack = m.origins.get("/permissions/allow/0").unwrap();
        assert!(user_stack[0].overridden);
    }

    #[test]
    fn enabled_plugins_is_scalar_later_wins_per_key() {
        // enabledPlugins is an object: "plugin@marketplace": bool
        // Later layer wins per key (deep-merge at the map level, scalar override at leaves).
        let m = merge(&[
            mk_layer(
                LayerKind::User,
                json!({"enabledPlugins": {"foo@mk": true, "bar@mk": true}}),
            ),
            mk_layer(
                LayerKind::Project,
                json!({"enabledPlugins": {"foo@mk": false}}),
            ),
        ]);
        assert_eq!(m.value["enabledPlugins"]["foo@mk"], json!(false));
        assert_eq!(m.value["enabledPlugins"]["bar@mk"], json!(true));
        assert_eq!(
            effective(&m.origins, "/enabledPlugins/foo@mk"),
            LayerKind::Project
        );
        assert_eq!(
            effective(&m.origins, "/enabledPlugins/bar@mk"),
            LayerKind::User
        );
    }

    #[test]
    fn json_pointer_segments_with_slashes_are_escaped() {
        assert_eq!(escape_json_pointer_segment("foo"), "foo");
        assert_eq!(escape_json_pointer_segment("a/b"), "a~1b");
        assert_eq!(escape_json_pointer_segment("~tilde"), "~0tilde");
        assert_eq!(escape_json_pointer_segment("a~/b"), "a~0~1b");
    }

    #[test]
    fn five_layer_cascade_orders_correctly() {
        let m = merge(&[
            mk_layer(LayerKind::Managed, json!({"model": "managed"})),
            mk_layer(LayerKind::User, json!({"model": "user"})),
            mk_layer(LayerKind::UserLocal, json!({"model": "user-local"})),
            mk_layer(LayerKind::Project, json!({"model": "project"})),
            mk_layer(LayerKind::ProjectLocal, json!({"model": "project-local"})),
        ]);
        assert_eq!(m.value["model"], json!("project-local"));
        assert_eq!(effective(&m.origins, "/model"), LayerKind::ProjectLocal);
        let stack = &m.origins["/model"];
        assert_eq!(stack.len(), 5);
        for c in &stack[..4] {
            assert!(c.overridden);
        }
        assert!(!stack[4].overridden);
    }
}
