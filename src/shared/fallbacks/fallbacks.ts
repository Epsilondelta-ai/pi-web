export function fallbackValue<T>(value: T | undefined | null | false | "" | 0, fallback: T): T {
  return value ? value : fallback;
}

export function present<T>(value: T | undefined | null): T | undefined {
  return value == null ? undefined : value;
}
