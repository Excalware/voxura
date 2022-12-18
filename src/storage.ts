import { invokeTauri } from './util';
import { useMemo, useState, useEffect } from 'react';

const cached: Record<string, any> = {};
export function getStoredValue<T>(key: string, defaultValue?: T) {
	return invokeTauri<T>('storage_get', {
		key,
		default: defaultValue ?? null
	}).then(value => {
		cached[key] = value;
		return value;
	});
};

let subscriptions: Function[] = [];
export function setStoredValue<T>(key: string, value: any) {
	cached[key] = value;
	return invokeTauri<T>('storage_set', { key, value }).then(() => {
		for (const callback of subscriptions)
			callback();
	});
};

function subscribe(callback: Function) {
	subscriptions.push(callback);
	return () => subscriptions = subscriptions.filter(s => s !== callback);
};

export function useStoredValue<T>(key: string, defaultValue?: T) {
	const subscription = useMemo(() => ({
        subscribe: (callback: any) => subscribe(callback),
        getCurrentValue: () => cached[key] ?? defaultValue
    }), []);
    return useSubscription<T>(subscription);
};

function useSubscription<T>({ subscribe, getCurrentValue }: {
    subscribe: (callback: Function) => () => void,
    getCurrentValue: () => T
}): T {
    const [state, setState] = useState(() => ({
        getCurrentValue,
        subscribe,
        value: getCurrentValue(),
    }));

    let valueToReturn = state.value;
    if (state.getCurrentValue !== getCurrentValue || state.subscribe !== subscribe) {
        valueToReturn = getCurrentValue();

        setState({
            getCurrentValue,
            subscribe,
            value: valueToReturn,
        });
    }

    useEffect(() => {
        let didUnsubscribe = false;
        const checkForUpdates = () => {
            if (didUnsubscribe)
                return;
            setState(prevState => {
                if (prevState.getCurrentValue !== getCurrentValue || prevState.subscribe !== subscribe)
                    return prevState;
                const value = getCurrentValue();
                return { ...prevState, value };
            });
        };
        const unsubscribe = subscribe(checkForUpdates);
        checkForUpdates();

        return () => {
            didUnsubscribe = true;
            unsubscribe();
        };
    }, [getCurrentValue, subscribe]);
    return valueToReturn;
};