use std::env;
use std::path::PathBuf;

fn main() {
  // The gomuks backend comes from scripts/ios-ffi-build.sh, which puts a static archive
  // per target under target/ios-ffi/. Only iOS links it; other targets build the crate
  // without the backend (see the cfg gates in lib.rs).
  if env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("ios") {
    let target = env::var("TARGET").unwrap_or_default();
    let kind = if target.ends_with("-sim") { "simulator" } else { "device" };
    let repo_root = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap())
      .join("../..")
      .canonicalize()
      .unwrap();
    let lib_dir = repo_root.join("target/ios-ffi").join(kind);
    if !lib_dir.join("libgomuksffi.a").exists() {
      panic!(
        "missing {}/libgomuksffi.a; run scripts/ios-ffi-build.sh {}",
        lib_dir.display(),
        kind
      );
    }
    println!("cargo:rerun-if-changed={}", lib_dir.join("libgomuksffi.a").display());
    println!("cargo:rustc-link-search=native={}", lib_dir.display());
    println!("cargo:rustc-link-lib=static=gomuksffi");
    // What the Go runtime and cgo dependencies (SQLite, libde265) need from the system.
    println!("cargo:rustc-link-lib=dylib=resolv");
    println!("cargo:rustc-link-lib=dylib=c++");
    for framework in ["CoreFoundation", "Security", "SystemConfiguration"] {
      println!("cargo:rustc-link-lib=framework={framework}");
    }
  }
  tauri_build::build()
}
