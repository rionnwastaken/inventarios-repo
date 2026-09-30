export class TypedEventEmitter<
  Events extends Record<string, (...args: any[]) => any>,
> {
  private listeners: { [K in keyof Events]?: Array<Events[K]> } = {};

  // Subscribe to an event (Autocomplete on event string & callback params)
  on<K extends keyof Events>(event: K, callback: Events[K]): () => void {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    console.log("addind pep", event);
    this.listeners[event]!.push(callback);

    // Return an unsubscribe function
    return () => this.off(event, callback);
  }

  // Trigger an event (Autocomplete on event string & type checks emitted data)
  emit<K extends keyof Events>(event: K, ...args: Parameters<Events[K]>): void {
    log.debug(`Emitting event ${event} with args `, args);
    this.listeners[event]?.forEach((callback) => callback(...args));
  }

  // Remove listener
  off<K extends keyof Events>(event: K, callback: Events[K]): void {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event]!.filter(
      (cb) => cb !== callback,
    );
  }
}
