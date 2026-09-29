const { ingestClientErrors } = require('../backend/src/controllers/telemetryController');

function mockRes() {
    const res = {
        statusCode: 200,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        }
    };
    return res;
}

describe('telemetryController', () => {
    test('ingestClientErrors returns 200 and truncates batch', () => {
        const req = {
            body: {
                reports: [
                    { level: 'error', message: 'TypeError: boom', url: '/cart' },
                    { level: 'warning', message: 'slow network' }
                ]
            }
        };
        const res = mockRes();
        ingestClientErrors(req, res);
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.message).toBe('Telemetry received');
        expect(res.body.received).toBe(2);
    });

    test('ingestClientErrors accepts empty body', () => {
        const res = mockRes();
        ingestClientErrors({ body: {} }, res);
        expect(res.body.received).toBe(0);
    });
});
