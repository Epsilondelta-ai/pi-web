import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

import { hostMatchesDomain, parseURL } from "../quota-shared";

export function detectZaiModel(
  ctx: Pick<ExtensionContext, "hasUI" | "model">,
): boolean {
  if (!ctx.hasUI) return false;
  const model = ctx.model as unknown as Record<string, unknown> | undefined;
  if (!model) return false;

  const baseUrl = String(model.baseUrl ?? "");
  if (baseUrl.trim() !== "") {
    return isAllowedZaiBaseURL(baseUrl) || isAllowedBigModelBaseURL(baseUrl);
  }

  const provider = String(model.provider ?? "").toLowerCase();
  const id = String(model.id ?? "").toLowerCase();
  const name = String(model.name ?? "").toLowerCase();
  const displayName = String(
    model.displayName ?? model.display_name ?? "",
  ).toLowerCase();
  return [provider, id, name, displayName].some(isZaiModelName);
}

export function modelContextKey(ctx: ExtensionContext): string {
  const model = ctx.model as unknown as Record<string, unknown> | undefined;
  return `${String(model?.provider ?? "none")}:${String(model?.id ?? "none")}:${String(model?.baseUrl ?? "")}`;
}

export function isAllowedZaiBaseURL(rawURL: string): boolean {
  const url = parseURL(rawURL);
  return Boolean(url && hostMatchesDomain(url.hostname.toLowerCase(), "z.ai"));
}

export function isAllowedBigModelBaseURL(rawURL: string): boolean {
  const url = parseURL(rawURL);
  return Boolean(
    url && hostMatchesDomain(url.hostname.toLowerCase(), "bigmodel.cn"),
  );
}

function isZaiModelName(value: string): boolean {
  return (
    value === "glm" ||
    value === "zai" ||
    value === "z.ai" ||
    value === "zhipu" ||
    value.includes("glm-")
  );
}
