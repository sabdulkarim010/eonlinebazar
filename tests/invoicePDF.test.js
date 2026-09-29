const invoice = require('../client/js/profile/invoice.js');

const sampleOrder = {
    _id: '507f1f77bcf86cd799439011',
    orderId: 'EOB-10042',
    createdAt: '2026-03-01T10:00:00.000Z',
    customerName: 'Karim Sheikh',
    customerPhone: '01700000000',
    customerAddress: 'House 12, Gulshan, Dhaka',
    shippingDistrict: 'Dhaka',
    shippingLocationType: 'Inside City',
    paymentMethod: 'COD',
    payment: { status: 'unpaid', name: 'Cash on Delivery' },
    couponCode: 'SAVE10',
    subtotal: 2000,
    discountAmount: 200,
    vatAmount: 150,
    vatPercentage: 15,
    priceTaxMode: 'EXCLUSIVE',
    deliveryCharge: 60,
    grandTotal: 2010,
    items: [
        {
            sku: 'SKU-RED-M',
            name: 'Premium Hoodie',
            variantAttribute: 'Size',
            variantValue: 'M',
            price: 1000,
            quantity: 2
        }
    ]
};

describe('EOBInvoice view model & HTML', () => {
    test('extractOrderFinancials mirrors canonical order totals without recomputation', () => {
        const fin = invoice.extractOrderFinancials(sampleOrder);
        expect(fin.subTotal).toBe(2000);
        expect(fin.discountAmount).toBe(200);
        expect(fin.vatAmount).toBe(150);
        expect(fin.deliveryCharge).toBe(60);
        expect(fin.grandTotal).toBe(2010);
    });

    test('buildInvoiceViewModel includes SKU, variant, tax and discount lines', () => {
        const model = invoice.buildInvoiceViewModel(sampleOrder);
        expect(model.items).toHaveLength(1);
        expect(model.items[0].sku).toBe('SKU-RED-M');
        expect(model.items[0].variant).toMatch(/Size/);
        expect(model.items[0].lineTotal).toBe(2000);
        expect(model.couponCode).toBe('SAVE10');
        expect(model.taxLabel).toMatch(/VAT/);
        expect(model.paymentStamp.label).toBe('CASH ON DELIVERY');
    });

    test('renderInvoiceHtml outputs structured invoice with matching line total and grand total', () => {
        const html = invoice.renderInvoiceHtml(invoice.buildInvoiceViewModel(sampleOrder));
        expect(html).toContain('Premium Hoodie');
        expect(html).toContain('SKU-RED-M');
        expect(html).toContain('SAVE10');
        expect(html).toContain('2,000.00');
        expect(html).toContain('2,010.00');
        expect(html).toContain('CASH ON DELIVERY');
        expect(html).toContain('data-invoice-id="EOB-10042"');
    });
});

describe('EOBInvoice actions', () => {
    test('downloadPdf triggers binary download from server invoice endpoint', async () => {
        const click = jest.fn();
        const remove = jest.fn();
        const anchor = { click, remove, href: '', download: '' };
        const appendChild = jest.fn();
        const revokeObjectURL = jest.fn();

        global.URL = {
            createObjectURL: jest.fn(() => 'blob:invoice'),
            revokeObjectURL
        };
        global.document = {
            createElement: jest.fn(() => anchor),
            body: { appendChild }
        };
        global.EOBStorage = {
            get: () => 'token-abc'
        };
        global.EOBStorageKeys = { TOKEN: 'token' };
        global.fetch = jest.fn(async () => ({
            ok: true,
            headers: { get: () => 'attachment; filename="invoice-EOB-10042.pdf"' },
            blob: async () => new Blob(['pdf-bytes'])
        }));

        const ok = await invoice.downloadPdf({
            orderId: sampleOrder._id,
            displayOrderId: sampleOrder.orderId,
            token: 'token-abc'
        });

        expect(ok).toBe(true);
        expect(global.fetch).toHaveBeenCalledWith(
            `/api/orders/${sampleOrder._id}/invoice`,
            expect.objectContaining({ method: 'GET' })
        );
        expect(click).toHaveBeenCalled();
        expect(revokeObjectURL).toHaveBeenCalledWith('blob:invoice');
    });

    test('printReceipt prints via hidden iframe without window.open', () => {
        const printFn = jest.fn();
        const write = jest.fn();
        const close = jest.fn();
        const iframeDoc = {
            open: jest.fn(),
            write,
            close,
            readyState: 'complete'
        };
        const iframeWin = {
            focus: jest.fn(),
            print: printFn,
            document: iframeDoc
        };
        const iframe = {
            id: '',
            style: {},
            setAttribute: jest.fn(),
            contentWindow: iframeWin,
            contentDocument: iframeDoc,
            onload: null
        };
        const openMock = jest.fn();
        const prevOpen = global.open;
        global.open = openMock;
        const appendChild = jest.fn();
        global.document = {
            getElementById: jest.fn(() => null),
            createElement: jest.fn(() => iframe),
            body: { appendChild }
        };
        const timerSpy = jest.spyOn(global, 'setTimeout').mockImplementation((fn) => {
            if (typeof fn === 'function') fn();
            return 1;
        });

        try {
            const opened = invoice.printReceipt(sampleOrder);
            expect(opened).toBe(true);
            expect(openMock).not.toHaveBeenCalled();
            expect(write).toHaveBeenCalledWith(expect.stringContaining('Premium Hoodie'));
            expect(printFn).toHaveBeenCalled();
        } finally {
            global.open = prevOpen;
            timerSpy.mockRestore();
        }
    });
});
