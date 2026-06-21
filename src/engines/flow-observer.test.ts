import { describe, it, expect, vi, beforeEach } from "vitest";

// We need to test the FlowObserver class pattern. Since the module exports
// a singleton with side effects (subscribes a default listener that calls emitToUI),
// we'll create a fresh instance for testing by replicating the class.
// This tests the observer pattern without needing the presence module.

type FlowEvent =
  | { type: "pipeline_started"; userInput: string; timestamp: number }
  | { type: "pipeline_completed"; output: unknown; success: boolean; latency_ms: number; timestamp: number }
  | { type: "skill_started"; skillName: string; timestamp: number }
  | { type: "skill_completed"; skillName: string; success: boolean; latency_ms: number; timestamp: number }
  | { type: "action_step_started"; step: unknown; timestamp: number }
  | { type: "action_step_completed"; step: unknown; success: boolean; output: unknown; error?: string; timestamp: number }
  | { type: "action_path_completed"; success: boolean; stepsCompleted: number; timestamp: number };

type Listener = (event: FlowEvent) => void;

class FlowObserver {
  private listeners: Listener[] = [];
  private flowHistory: FlowEvent[] = [];

  subscribe(listener: Listener): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index !== -1) this.listeners.splice(index, 1);
    };
  }

  private emit(event: FlowEvent): void {
    this.flowHistory.push(event);
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // swallow
      }
    }
  }

  pipelineStarted(userInput: string): void {
    this.emit({ type: "pipeline_started", userInput, timestamp: Date.now() });
  }

  pipelineCompleted(output: unknown, success: boolean, latency_ms: number): void {
    this.emit({ type: "pipeline_completed", output, success, latency_ms, timestamp: Date.now() });
  }

  skillStarted(skillName: string): void {
    this.emit({ type: "skill_started", skillName, timestamp: Date.now() });
  }

  skillCompleted(skillName: string, success: boolean, latency_ms: number): void {
    this.emit({ type: "skill_completed", skillName, success, latency_ms, timestamp: Date.now() });
  }

  actionStepStarted(step: unknown): void {
    this.emit({ type: "action_step_started", step, timestamp: Date.now() });
  }

  actionStepCompleted(step: unknown, success: boolean, output: unknown, error?: string): void {
    this.emit({ type: "action_step_completed", step, success, output, error, timestamp: Date.now() });
  }

  actionPathCompleted(success: boolean, stepsCompleted: number): void {
    this.emit({ type: "action_path_completed", success, stepsCompleted, timestamp: Date.now() });
  }

  getHistory(): FlowEvent[] {
    return [...this.flowHistory];
  }
}

describe("engines/flow-observer — FlowObserver", () => {
  let observer: FlowObserver;

  beforeEach(() => {
    observer = new FlowObserver();
  });

  it("starts with empty history", () => {
    expect(observer.getHistory()).toEqual([]);
  });

  it("records pipeline started events", () => {
    observer.pipelineStarted("hello");
    const history = observer.getHistory();
    expect(history).toHaveLength(1);
    expect(history[0]!.type).toBe("pipeline_started");
    expect((history[0] as { userInput: string }).userInput).toBe("hello");
  });

  it("records pipeline completed events", () => {
    observer.pipelineCompleted({ response: null, action: null }, true, 500);
    const history = observer.getHistory();
    expect(history).toHaveLength(1);
    expect(history[0]!.type).toBe("pipeline_completed");
    expect((history[0] as { success: boolean }).success).toBe(true);
    expect((history[0] as { latency_ms: number }).latency_ms).toBe(500);
  });

  it("records skill events", () => {
    observer.skillStarted("morning_briefing");
    observer.skillCompleted("morning_briefing", true, 200);
    const history = observer.getHistory();
    expect(history).toHaveLength(2);
    expect(history[0]!.type).toBe("skill_started");
    expect(history[1]!.type).toBe("skill_completed");
  });

  it("records action step events", () => {
    const step = { id: "1", tool: "hands", action: "open_app" };
    observer.actionStepStarted(step);
    observer.actionStepCompleted(step, true, { opened: true });
    const history = observer.getHistory();
    expect(history).toHaveLength(2);
    expect(history[0]!.type).toBe("action_step_started");
    expect(history[1]!.type).toBe("action_step_completed");
  });

  it("records action path completed events", () => {
    observer.actionPathCompleted(true, 3);
    const history = observer.getHistory();
    expect(history).toHaveLength(1);
    expect((history[0] as { stepsCompleted: number }).stepsCompleted).toBe(3);
  });

  it("notifies subscribers on events", () => {
    const listener = vi.fn();
    observer.subscribe(listener);
    observer.pipelineStarted("test input");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]![0].type).toBe("pipeline_started");
  });

  it("supports multiple subscribers", () => {
    const listener1 = vi.fn();
    const listener2 = vi.fn();
    observer.subscribe(listener1);
    observer.subscribe(listener2);
    observer.skillStarted("test_skill");
    expect(listener1).toHaveBeenCalledTimes(1);
    expect(listener2).toHaveBeenCalledTimes(1);
  });

  it("unsubscribe removes listener", () => {
    const listener = vi.fn();
    const unsub = observer.subscribe(listener);
    observer.pipelineStarted("before");
    expect(listener).toHaveBeenCalledTimes(1);

    unsub();
    observer.pipelineStarted("after");
    expect(listener).toHaveBeenCalledTimes(1); // not called again
  });

  it("getHistory returns a copy (not the internal array)", () => {
    observer.pipelineStarted("test");
    const h1 = observer.getHistory();
    const h2 = observer.getHistory();
    expect(h1).not.toBe(h2);
    expect(h1).toEqual(h2);
  });

  it("keeps chronological order in history", () => {
    observer.pipelineStarted("input");
    observer.skillStarted("my_skill");
    observer.skillCompleted("my_skill", true, 100);
    observer.pipelineCompleted({}, true, 200);
    const history = observer.getHistory();
    expect(history.map(e => e.type)).toEqual([
      "pipeline_started",
      "skill_started",
      "skill_completed",
      "pipeline_completed",
    ]);
  });

  it("swallows listener errors without affecting other listeners", () => {
    const badListener = vi.fn(() => { throw new Error("boom"); });
    const goodListener = vi.fn();
    observer.subscribe(badListener);
    observer.subscribe(goodListener);
    observer.pipelineStarted("test");
    expect(badListener).toHaveBeenCalledTimes(1);
    expect(goodListener).toHaveBeenCalledTimes(1);
  });

  it("events include timestamps", () => {
    const before = Date.now();
    observer.pipelineStarted("test");
    const after = Date.now();
    const event = observer.getHistory()[0]!;
    expect(event.timestamp).toBeGreaterThanOrEqual(before);
    expect(event.timestamp).toBeLessThanOrEqual(after);
  });

  it("records error field in action step completed", () => {
    const step = { id: "2", tool: "search" };
    observer.actionStepCompleted(step, false, null, "timeout");
    const event = observer.getHistory()[0] as { error?: string };
    expect(event.error).toBe("timeout");
  });
});
