import { createSlice } from '@reduxjs/toolkit';

import Instance from '../instances/instance';

interface InstancesState {
    data: Array<Instance>
};
const initialState: InstancesState = {
    data: []
};
export const instancesSlice = createSlice({
    name: 'instances',
    initialState,
    reducers: {
        addInstance: (state, { payload }) => {
            state.data.push(payload);
        },
        setInstances: (state, { payload }) => {
            state.data = payload;
        },
        clearInstances: (state) => {
            state.data = [];
        }
    }
});

export const { addInstance, setInstances, clearInstances } = instancesSlice.actions;
export default instancesSlice.reducer;