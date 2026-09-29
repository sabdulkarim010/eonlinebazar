/********************************************************************
 * POST /api/orders/quote — pre-checkout pricing (read-only).
 ********************************************************************/

const { computeOrderQuote } = require('../services/orderQuoteService');

async function createOrderQuote(req, res) {
    try {
        const userId = req.user ? req.user.id : null;
        const result = await computeOrderQuote({
            ...req.body,
            userId
        });

        if (!result.ok) {
            return res.status(result.status || 400).json({
                success: false,
                code: result.code,
                message: result.message,
                itemErrors: result.itemErrors || []
            });
        }

        return res.json({
            success: true,
            data: result.quote,
            items: result.items
        });
    } catch (err) {
        if (process.env.NODE_ENV !== 'test') {
            console.error('[OrderQuote]', err);
        }
        return res.status(500).json({
            success: false,
            message: 'Unable to calculate order quote.'
        });
    }
}

module.exports = { createOrderQuote };
