const express = require('express');
const { body, validationResult, query } = require('express-validator');
const Campaign = require('../models/Campaign');
const { auth, managerAuth } = require('../middleware/auth');
const router = express.Router();
router.get('/', auth, [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('status').optional().isIn(['draft', 'active', 'paused', 'completed', 'cancelled']),
  query('category').optional().isIn(['education', 'healthcare', 'environment', 'poverty', 'disaster-relief', 'arts', 'other']),
  query('isFeatured').optional().isBoolean(),
  query('isPublic').optional().isBoolean()
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
    if (req.query.status) filter.status = req.query.status;
    if (req.query.category) filter.category = req.query.category;
    if (req.query.isFeatured !== undefined) filter.isFeatured = req.query.isFeatured;
    if (req.query.isPublic !== undefined) filter.isPublic = req.query.isPublic;

    const campaigns = await Campaign.find(filter)
      .populate('organizer', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Campaign.countDocuments(filter);

    res.json({
      campaigns,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: limit
      }
    });
  } catch (error) {
    console.error('Get campaigns error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});
router.post('/', managerAuth, [
  body('name').trim().isLength({ min: 3 }).withMessage('Campaign name must be at least 3 characters'),
  body('description').trim().isLength({ min: 10 }).withMessage('Description must be at least 10 characters'),
  body('goal').isFloat({ min: 1 }).withMessage('Goal must be greater than 0'),
  body('startDate').isISO8601().withMessage('Valid start date is required'),
  body('endDate').isISO8601().withMessage('Valid end date is required'),
  body('category').isIn(['education', 'healthcare', 'environment', 'poverty', 'disaster-relief', 'arts', 'other']),
  body('status').optional().isIn(['draft', 'active', 'paused', 'completed', 'cancelled']),
  body('image').optional().trim(),
  body('tags').optional().isArray(),
  body('isFeatured').optional().isBoolean(),
  body('isPublic').optional().isBoolean(),
  body('notes').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      name,
      description,
      goal,
      startDate,
      endDate,
      category,
      status = 'draft',
      image,
      tags = [],
      isFeatured = false,
      isPublic = true,
      notes
    } = req.body;
    if (new Date(startDate) >= new Date(endDate)) {
      return res.status(400).json({ message: 'End date must be after start date' });
    }

    const campaign = new Campaign({
      name,
      description,
      goal,
      startDate,
      endDate,
      category,
      status,
      image,
      organizer: req.user._id,
      tags,
      isFeatured,
      isPublic,
      notes
    });

    await campaign.save();
    await campaign.populate('organizer', 'name email');

    res.status(201).json({
      message: 'Campaign created successfully',
      campaign
    });
  } catch (error) {
    console.error('Create campaign error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});
router.get('/:id', auth, async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id)
      .populate('organizer', 'name email');

    if (!campaign) {
      return res.status(404).json({ message: 'Campaign not found' });
    }

    res.json({ campaign });
  } catch (error) {
    console.error('Get campaign error:', error);
    if (error.kind === 'ObjectId') {
      return res.status(400).json({ message: 'Invalid campaign ID' });
    }
    res.status(500).json({ message: 'Server error' });
  }
});
router.put('/:id', managerAuth, [
  body('name').optional().trim().isLength({ min: 3 }).withMessage('Campaign name must be at least 3 characters'),
  body('description').optional().trim().isLength({ min: 10 }).withMessage('Description must be at least 10 characters'),
  body('goal').optional().isFloat({ min: 1 }).withMessage('Goal must be greater than 0'),
  body('startDate').optional().isISO8601().withMessage('Valid start date is required'),
  body('endDate').optional().isISO8601().withMessage('Valid end date is required'),
  body('category').optional().isIn(['education', 'healthcare', 'environment', 'poverty', 'disaster-relief', 'arts', 'other']),
  body('status').optional().isIn(['draft', 'active', 'paused', 'completed', 'cancelled']),
  body('image').optional().trim(),
  body('tags').optional().isArray(),
  body('isFeatured').optional().isBoolean(),
  body('isPublic').optional().isBoolean(),
  body('notes').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const updateFields = { ...req.body };
    if (updateFields.startDate && updateFields.endDate) {
      if (new Date(updateFields.startDate) >= new Date(updateFields.endDate)) {
        return res.status(400).json({ message: 'End date must be after start date' });
      }
    }

    const campaign = await Campaign.findByIdAndUpdate(
      req.params.id,
      updateFields,
      { new: true, runValidators: true }
    ).populate('organizer', 'name email');

    if (!campaign) {
      return res.status(404).json({ message: 'Campaign not found' });
    }

    res.json({
      message: 'Campaign updated successfully',
      campaign
    });
  } catch (error) {
    console.error('Update campaign error:', error);
    if (error.kind === 'ObjectId') {
      return res.status(400).json({ message: 'Invalid campaign ID' });
    }
    res.status(500).json({ message: 'Server error' });
  }
});
router.delete('/:id', managerAuth, async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id);
    
    if (!campaign) {
      return res.status(404).json({ message: 'Campaign not found' });
    }
    const Donation = require('../models/Donation');
    const donationCount = await Donation.countDocuments({ campaign: req.params.id });
    
    if (donationCount > 0) {
      return res.status(400).json({ 
        message: 'Cannot delete campaign with existing donations. Consider setting status to cancelled instead.' 
      });
    }

    await Campaign.findByIdAndDelete(req.params.id);

    res.json({ message: 'Campaign deleted successfully' });
  } catch (error) {
    console.error('Delete campaign error:', error);
    if (error.kind === 'ObjectId') {
      return res.status(400).json({ message: 'Invalid campaign ID' });
    }
    res.status(500).json({ message: 'Server error' });
  }
});
router.get('/stats/summary', auth, async (req, res) => {
  try {
    const totalCampaigns = await Campaign.countDocuments();
    const activeCampaigns = await Campaign.countDocuments({ status: 'active' });
    const completedCampaigns = await Campaign.countDocuments({ status: 'completed' });
    
    const categoryStats = await Campaign.aggregate([
      { $group: { _id: '$category', count: { $sum: 1 } } }
    ]);

    const topCampaigns = await Campaign.find({ status: { $in: ['active', 'completed'] } })
      .sort({ currentAmount: -1 })
      .limit(5)
      .select('name goal currentAmount status');

    const recentCampaigns = await Campaign.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .select('name status createdAt');

    res.json({
      summary: {
        totalCampaigns,
        activeCampaigns,
        completedCampaigns,
        draftCampaigns: await Campaign.countDocuments({ status: 'draft' })
      },
      categoryStats,
      topCampaigns,
      recentCampaigns
    });
  } catch (error) {
    console.error('Get campaign stats error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router; 