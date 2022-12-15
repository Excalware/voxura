import { invokeTauri } from './util';
export function getStoredValue<T>(key: string, defaultValue: any = null) {
	return invokeTauri<T>('storage_get', {
		key,
		default: defaultValue
	});
};

export function setStoredValue<T>(key: string, value: any) {
	return invokeTauri<T>('storage_set', { key, value });
};