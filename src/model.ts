import { z } from 'zod';
const id = z.string().uuid();
const date = z.string().datetime();
export const referenceSchema = z.object({
  label: z.string().trim().min(1).max(200),
  value: z.string().trim().min(1).max(2000),
});
export const checkpointInput = z.object({
  projectId: id,
  title: z.string().trim().min(1).max(120),
  notes: z.string().max(12000),
  references: z.array(referenceSchema).max(30),
});
export const settingsSchema = z.object({
  name: z.string().trim().min(1).max(40),
  compact: z.boolean(),
  alwaysOnTop: z.boolean(),
});
export const stateSchema = z.object({
  version: z.literal(1),
  projects: z
    .array(
      z.object({ id, name: z.string().trim().min(1).max(80), createdAt: date }),
    )
    .max(200),
  checkpoints: z
    .array(
      checkpointInput.extend({
        id,
        createdAt: date,
        capture: z
          .object({
            filename: z.string().regex(/^[a-f0-9-]+\.png$/),
            source: z.string(),
          })
          .optional(),
      }),
    )
    .max(10000),
  messages: z
    .array(
      z.object({
        id,
        text: z.string().trim().min(1).max(4000),
        createdAt: date,
      }),
    )
    .max(1000),
  activity: z
    .array(z.object({ id, text: z.string(), createdAt: date }))
    .max(500),
  settings: settingsSchema,
});
export type State = z.infer<typeof stateSchema>;
export type CheckpointInput = z.infer<typeof checkpointInput>;
export type Settings = State['settings'];
export type Reference = z.infer<typeof referenceSchema>;
export type Action =
  | { type: 'project'; name: string }
  | {
      type: 'checkpoint';
      input: CheckpointInput;
      capture?: State['checkpoints'][number]['capture'];
    }
  | { type: 'message'; text: string }
  | { type: 'settings'; settings: Settings };
export function initialState(): State {
  return {
    version: 1,
    projects: [],
    checkpoints: [],
    messages: [],
    activity: [],
    settings: { name: 'Swire', compact: false, alwaysOnTop: false },
  };
}
export function applyAction(state: State, action: Action): State {
  const next = structuredClone(state);
  const createdAt = new Date().toISOString();
  const uid = () => crypto.randomUUID();
  let text: string;
  switch (action.type) {
    case 'project': {
      const name = z.string().trim().min(1).max(80).parse(action.name);
      next.projects.push({ id: uid(), name, createdAt });
      text = `Project created: ${name}`;
      break;
    }
    case 'checkpoint': {
      const input = checkpointInput.parse(action.input);
      if (!next.projects.some((p) => p.id === input.projectId))
        throw new Error('Choose an existing project.');
      next.checkpoints.unshift({
        ...input,
        id: uid(),
        createdAt,
        ...(action.capture ? { capture: action.capture } : {}),
      });
      text = `Checkpoint saved: ${input.title}`;
      break;
    }
    case 'message': {
      const message = z.string().trim().min(1).max(4000).parse(action.text);
      next.messages.push({ id: uid(), text: message, createdAt });
      next.messages = next.messages.slice(-1000);
      text = 'Personal chat note saved locally';
      break;
    }
    case 'settings':
      next.settings = settingsSchema.parse(action.settings);
      text = 'Companion settings updated';
      break;
  }
  next.activity.unshift({ id: uid(), text, createdAt });
  next.activity = next.activity.slice(0, 500);
  return stateSchema.parse(next);
}
export type CapturePreview = { token: string; name: string; image: string };
export interface CompanionAPI {
  desktop: boolean;
  load(): Promise<State>;
  project(name: string): Promise<State>;
  checkpoint(input: CheckpointInput, token?: string): Promise<State>;
  message(text: string): Promise<State>;
  settings(settings: Settings): Promise<State>;
  pickFiles(): Promise<Reference[]>;
  previewCapture(): Promise<CapturePreview[]>;
  cancelCapture(): Promise<void>;
  readCapture(filename: string): Promise<string>;
}
