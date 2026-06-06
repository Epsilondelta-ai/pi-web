import { AsyncSubject, BehaviorSubject, ReplaySubject, Subject } from "rxjs";

export type PiWebSubjectKind = "subject" | "behaviorSubject" | "replaySubject" | "asyncSubject";

type SubjectEntry = {
  kind: PiWebSubjectKind;
  subject: Subject<unknown>;
};

export type PiWebSubjects = {
  subject<T>(name: string): Subject<T>;
  behaviorSubject<T>(name: string, initialValue: T): BehaviorSubject<T>;
  replaySubject<T>(name: string, bufferSize?: number): ReplaySubject<T>;
  asyncSubject<T>(name: string): AsyncSubject<T>;
  hasSubject(name: string): boolean;
  deleteSubject(name: string): boolean;
  completeSubject(name: string): void;
  listSubjects(): string[];
};

type PiWebWindow = Window & typeof globalThis & {
  piWeb?: PiWebSubjects;
};

const registry: Map<string, SubjectEntry> = new Map<string, SubjectEntry>();

function assertSubjectKind(name: string, expectedKind: PiWebSubjectKind, entry: SubjectEntry): void {
  if (entry.kind !== expectedKind) {
    throw new Error(`piWeb subject "${name}" already exists as ${entry.kind}`);
  }
}

function getSubject<T>(name: string, kind: "subject", factory: () => Subject<T>): Subject<T>;
function getSubject<T>(
  name: string,
  kind: "behaviorSubject",
  factory: () => BehaviorSubject<T>,
): BehaviorSubject<T>;
function getSubject<T>(name: string, kind: "replaySubject", factory: () => ReplaySubject<T>): ReplaySubject<T>;
function getSubject<T>(name: string, kind: "asyncSubject", factory: () => AsyncSubject<T>): AsyncSubject<T>;
function getSubject<T>(name: string, kind: PiWebSubjectKind, factory: () => Subject<T>): Subject<T> {
  const existingEntry: SubjectEntry | undefined = registry.get(name);
  if (existingEntry) {
    assertSubjectKind(name, kind, existingEntry);
    return existingEntry.subject as Subject<T>;
  }

  const subject: Subject<T> = factory();
  registry.set(name, { kind, subject: subject as Subject<unknown> });

  return subject;
}

export function createPiWebSubjects(): PiWebSubjects {
  return {
    subject<T>(name: string): Subject<T> {
      return getSubject<T>(name, "subject", (): Subject<T> => new Subject<T>());
    },
    behaviorSubject<T>(name: string, initialValue: T): BehaviorSubject<T> {
      return getSubject<T>(
        name,
        "behaviorSubject",
        (): BehaviorSubject<T> => new BehaviorSubject<T>(initialValue),
      );
    },
    replaySubject<T>(name: string, bufferSize = 1): ReplaySubject<T> {
      return getSubject<T>(name, "replaySubject", (): ReplaySubject<T> => new ReplaySubject<T>(bufferSize));
    },
    asyncSubject<T>(name: string): AsyncSubject<T> {
      return getSubject<T>(name, "asyncSubject", (): AsyncSubject<T> => new AsyncSubject<T>());
    },
    hasSubject(name: string): boolean {
      return registry.has(name);
    },
    deleteSubject(name: string): boolean {
      return registry.delete(name);
    },
    completeSubject(name: string): void {
      registry.get(name)?.subject.complete();
    },
    listSubjects(): string[] {
      return [...registry.keys()].sort();
    },
  };
}

export function ensurePiWebSubjects(target: PiWebWindow = window as PiWebWindow): PiWebSubjects {
  target.piWeb ??= createPiWebSubjects();

  return target.piWeb;
}
