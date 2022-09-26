import { TypedUseSelectorHook, useDispatch, useSelector } from 'react-redux';
import type { RootState, AppDispatch } from './store';
export const useVoxuraDispatch: () => AppDispatch = useDispatch
export const useVoxuraSelector: TypedUseSelectorHook<RootState> = useSelector;