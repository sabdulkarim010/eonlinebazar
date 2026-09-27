'use strict';

const {
    shouldRunLeaveSideEffectsSync,
    scheduleLeaveSideEffect
} = require('../../backend/src/services/leaveWorkflowService');

describe('leaveWorkflowService', () => {
    test('runs side effects synchronously in test environment', () => {
        expect(shouldRunLeaveSideEffectsSync()).toBe(true);
    });

    test('scheduleLeaveSideEffect completes before return in test env', async () => {
        let ran = false;
        await scheduleLeaveSideEffect(async () => {
            ran = true;
        });
        expect(ran).toBe(true);
    });
});
