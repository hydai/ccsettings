//! Golden-file integration tests for the cascade merge engine.
//!
//! Each subdirectory of `tests/fixtures/cascade/` is one fixture with:
//! - `layers/{managed,user,user-local,project,project-local}.json` (any subset)
//! - `expected.json` — the expected `MergedView::value` after merging.
//!
//! Missing layer files are loaded as `Absent` and contribute nothing. These
//! tests validate only the merged `value`; per-path origin attribution is
//! covered by unit tests in `src/cascade.rs`.

use ccsettings_lib::cascade::merge;
use ccsettings_lib::layers::{load_layer, Layer, LayerKind};
use serde_json::Value;
use std::path::{Path, PathBuf};

fn fixture_dir(name: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures/cascade")
        .join(name)
}

fn load_all_layers(dir: &Path) -> Vec<Layer> {
    [
        (LayerKind::Managed, "managed.json"),
        (LayerKind::User, "user.json"),
        (LayerKind::UserLocal, "user-local.json"),
        (LayerKind::Project, "project.json"),
        (LayerKind::ProjectLocal, "project-local.json"),
    ]
    .into_iter()
    .map(|(kind, name)| {
        load_layer(kind, dir.join("layers").join(name))
            .expect("load_layer should not fail with I/O (NotFound is Absent)")
    })
    .collect()
}

fn run(name: &str) {
    let dir = fixture_dir(name);
    let layers = load_all_layers(&dir);
    let merged = merge(&layers);

    let expected_path = dir.join("expected.json");
    let expected_bytes = std::fs::read(&expected_path)
        .unwrap_or_else(|e| panic!("read {}: {e}", expected_path.display()));
    let expected: Value = serde_json::from_slice(&expected_bytes)
        .unwrap_or_else(|e| panic!("parse {}: {e}", expected_path.display()));

    assert_eq!(
        merged.value,
        expected,
        "\n\nfixture `{name}` mismatch\n--- actual ---\n{}\n--- expected ---\n{}\n",
        serde_json::to_string_pretty(&merged.value).unwrap(),
        serde_json::to_string_pretty(&expected).unwrap(),
    );
}

#[test]
fn empty_all_layers_absent() {
    run("01_empty");
}

#[test]
fn single_user_layer_is_identity() {
    run("02_single_layer");
}

#[test]
fn scalar_override_later_wins() {
    run("03_scalar_override");
}

#[test]
fn hooks_append_across_layers_per_event() {
    run("04_hooks_append");
}

#[test]
fn permissions_allow_deny_ask_union_with_dedup() {
    run("05_permissions_union");
}

#[test]
fn env_deep_merges_with_later_wins_on_key_conflict() {
    run("06_deep_merge_env");
}

#[test]
fn enabled_plugins_override_per_key() {
    run("07_plugins_toggles");
}

#[test]
fn enabled_and_disabled_mcp_servers_union() {
    run("08_mcp_servers_mixed");
}

#[test]
fn five_tier_cascade_combines_all_rules() {
    run("09_full_5_tier_cascade");
}

#[test]
fn non_special_arrays_replace_not_merge() {
    run("10_array_replace_default");
}
