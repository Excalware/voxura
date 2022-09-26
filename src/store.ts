import { configureStore } from '@reduxjs/toolkit';

import Instance from './instances/instance';
import instances from './slices/instances';
const store = configureStore({
    reducer: {
        instances
    },
    middleware: [
        store => next => action => {
            console.log('dispatching', action);

            console.log(action.payload);
            if (action.payload instanceof Instance) {
                const { name, path } = action.payload;
                action.payload = {
                    name,
                    path
                };
            }

            const result = next(action);
            console.log('next state', store.getState());
            return result;
        }
    ]
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
export default store;