#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const version = requiredEnv("PI_WEB_VERSION").replace(/^v/, "");
const repo = process.env.PI_WEB_REPO ?? "Epsilondelta-ai/pi-web";
const output = process.env.PI_WEB_HOMEBREW_FORMULA ?? "Formula/pi-web.rb";
const darwinArm64Sha = requiredEnv("PI_WEB_DARWIN_ARM64_SHA256");
const darwinAmd64Sha = requiredEnv("PI_WEB_DARWIN_AMD64_SHA256");

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function assetUrl(arch) {
  return `https://github.com/${repo}/releases/download/v${version}/pi-web_${version}_darwin_${arch}.tar.gz`;
}

const formula = `class PiWeb < Formula
  desc "Browser UI for operating the local pi coding agent"
  homepage "https://github.com/${repo}"
  version "${version}"
  license "MIT"

  on_macos do
    on_arm do
      url "${assetUrl("arm64")}"
      sha256 "${darwinArm64Sha}"
    end

    on_intel do
      url "${assetUrl("amd64")}"
      sha256 "${darwinAmd64Sha}"
    end
  end

  def install
    libexec.install "pi-web"
    (bin/"pi-web").write <<~EOS
      #!/bin/bash
      export PI_WEB_INSTALLER=brew
      exec "#{libexec}/pi-web" "$@"
    EOS
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/pi-web --version")
  end
end
`;

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, formula);
