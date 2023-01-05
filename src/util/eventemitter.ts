export type Callback = (...args: any[]) => void
export interface Listener {
    name: string
    callback: (...data: any[]) => void
}
export default class EventEmitter {
    private listeners: Listener[] = [];
    public emitEvent(name: string, ...data: any[]) {
        this.listeners.filter(l => l.name === name).forEach(l =>
            setTimeout(() => l.callback(...data), 0)
        );
    }

    public listenForEvent(name: string, callback: Callback): () => void {
        const obj = { name, callback };
        this.listeners.push(obj);

        return () => this.listeners = this.listeners.filter(l => l !== obj);
    }

    public unlistenForEvent(name: string, callback: Callback) {
        this.listeners = this.listeners.filter(l => l.name !== name && l.callback !== callback);
    }

	public awaitEvent(name: string) {
		return new Promise<void>(resolve => {
            const callback = () => {
                this.unlistenForEvent(name, callback);
                resolve();
            };
            this.listenForEvent(name, callback);
        });
	}
}