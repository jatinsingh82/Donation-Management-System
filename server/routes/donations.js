const express = require('express');
const { body, validationResult, query } = require('express-validator');
const Donation = require('../models/Donation');
const Donor = require('../models/Donor');
const Campaign = require('../models/Campaign');
const { auth, managerAuth } = require('../middleware/auth');
const router = express.Router();
router.get('/', auth, [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('status').optional().isIn(['pending', 'completed', 'failed', 'refunded', 'cancelled']),
  query('campaign').optional().isMongoId().withMessage('Invalid campaign ID'),
  query('donor').optional().isMongoId().withMessage('Invalid donor ID'),
  query('startDate').optional().isISO8601().withMessage('Invalid start date'),
  query('endDate').optional().isISO8601().withMessage('Invalid end date')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const filter = {};
    if (req.query.status) filter.paymentStatus = req.query.status;
    if (req.query.campaign) filter.campaign = req.query.campaign;
    if (req.query.donor) filter.donor = req.query.donor;
    if (req.query.startDate || req.query.endDate) {
      filter.createdAt = {};
      if (req.query.startDate) filter.createdAt.$gte = new Date(req.query.startDate);
      if (req.query.endDate) filter.createdAt.$lte = new Date(req.query.endDate);
    }

    const donations = await Donation.find(filter)
      .populate('donor', 'firstName lastName email')
      .populate('campaign', 'name')
      .populate('processedBy', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Donation.countDocuments(filter);

    res.json({
      donations,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: limit
      }
    });
  } catch (error) {
    console.error('Get donations error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});
router.post('/', managerAuth, [
  body('donor').isMongoId().withMessage('Valid donor ID is required'),
  body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be greater than 0'),
  body('paymentMethod').isIn(['credit_card', 'debit_card', 'bank_transfer', 'check', 'cash', 'paypal', 'stripe', 'other']),
  body('campaign').optional().isMongoId().withMessage('Invalid campaign ID'),
  body('currency').optional().isIn(['USD', 'EUR', 'GBP', 'CAD', 'AUD']),
  body('isAnonymous').optional().isBoolean(),
  body('isRecurring').optional().isBoolean(),
  body('recurringFrequency').optional().isIn(['weekly', 'monthly', 'quarterly', 'yearly']),
  body('message').optional().trim().isLength({ max: 500 }).withMessage('Message too long'),
  body('notes').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      donor,
      campaign,
      amount,
      currency = 'USD',
      paymentMethod,
      isAnonymous = false,
      isRecurring = false,
      recurringFrequency,
      message,
      notes
    } = req.body;
    const donorExists = await Donor.findById(donor);
    if (!donorExists) {
      return res.status(400).json({ message: 'Donor not found' });
    }
    if (campaign) {
      const campaignExists = await Campaign.findById(campaign);
      if (!campaignExists) {
        return res.status(400).json({ message: 'Campaign not found' });
      }
    }
    if (isRecurring && !recurringFrequency) {
      return res.status(400).json({ message: 'Recurring frequency is required for recurring donations' });
    }

    const donation = new Donation({
      donor,
      campaign,
      amount,
      currency,
      paymentMethod,
      isAnonymous,
      isRecurring,
      recurringFrequency,
      message,
      notes,
      processedBy: req.user._id
    });
    await donation.save();
    await donation.populate('donor', 'firstName lastName email');
    await donation.populate('campaign', 'name');
    await donation.populate('processedBy', 'name');

    res.status(201).json({
      message: 'Donation created successfully',
      donation
    });
  } catch (error) {
    console.error('Create donation error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});
router.get('/:id', auth, async (req, res) => {
  try {
    const donation = await Donation.findById(req.params.id)
      .populate('donor', 'firstName lastName email phone address')
      .populate('campaign', 'name description goal currentAmount')
      .populate('processedBy', 'name');

    if (!donation) {
      return res.status(404).json({ message: 'Donation not found' });
    }

    res.json({ donation });
  } catch (error) {
    console.error('Get donation error:', error);
    if (error.kind === 'ObjectId') {
      return res.status(400).json({ message: 'Invalid donation ID' });
    }
    res.status(500).json({ message: 'Server error' });
  }
});
router.put('/:id', managerAuth, [
  body('paymentStatus').optional().isIn(['pending', 'completed', 'failed', 'refunded', 'cancelled']),
  body('notes').optional().trim(),
  body('tags').optional().isArray()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { paymentStatus, notes, tags } = req.body;
    const updateFields = {};

    if (paymentStatus !== undefined) updateFields.paymentStatus = paymentStatus;
    if (notes !== undefined) updateFields.notes = notes;
    if (tags !== undefined) updateFields.tags = tags;

    const donation = await Donation.findByIdAndUpdate(
      req.params.id,
      updateFields,
      { new: true, runValidators: true }
    )
      .populate('donor', 'firstName lastName email')
      .populate('campaign', 'name')
      .populate('processedBy', 'name');

    if (!donation) {
      return res.status(404).json({ message: 'Donation not found' });
    }

    res.json({
      message: 'Donation updated successfully',
      donation
    });
  } catch (error) {
    console.error('Update donation error:', error);
    if (error.kind === 'ObjectId') {
      return res.status(400).json({ message: 'Invalid donation ID' });
    }
    res.status(500).json({ message: 'Server error' });
  }
});
router.delete('/:id', managerAuth, async (req, res) => {
  try {
    const donation = await Donation.findById(req.params.id);
    
    if (!donation) {
      return res.status(404).json({ message: 'Donation not found' });
    }
    if (donation.paymentStatus === 'completed') {
      return res.status(400).json({ message: 'Cannot delete completed donations' });
    }

    await Donation.findByIdAndDelete(req.params.id);

    res.json({ message: 'Donation deleted successfully' });
  } catch (error) {
    console.error('Delete donation error:', error);
    if (error.kind === 'ObjectId') {
      return res.status(400).json({ message: 'Invalid donation ID' });
    }
    res.status(500).json({ message: 'Server error' });
  }
});
router.get('/stats/summary', auth, async (req, res) => {
  try {
    const totalDonations = await Donation.countDocuments();
    const totalAmount = await Donation.aggregate([
      { $match: { paymentStatus: 'completed' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    const monthlyStats = await Donation.aggregate([
      { $match: { paymentStatus: 'completed' } },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          count: { $sum: 1 },
          amount: { $sum: '$amount' }
        }
      },
      { $sort: { '_id.year': -1, '_id.month': -1 } },
      { $limit: 12 }
    ]);

    const statusStats = await Donation.aggregate([
      { $group: { _id: '$paymentStatus', count: { $sum: 1 } } }
    ]);

    res.json({
      summary: {
        totalDonations,
        totalAmount: totalAmount[0]?.total || 0,
        completedDonations: statusStats.find(s => s._id === 'completed')?.count || 0
      },
      monthlyStats,
      statusStats
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router; 