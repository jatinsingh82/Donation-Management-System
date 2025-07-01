const express = require('express');
const { body, validationResult, query } = require('express-validator');
const Donor = require('../models/Donor');
const { auth, managerAuth } = require('../middleware/auth');
const router = express.Router();
router.get('/', auth, [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('search').optional().trim(),
  query('donorType').optional().isIn(['individual', 'corporate', 'foundation']),
  query('isActive').optional().isBoolean()
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
    if (req.query.donorType) filter.donorType = req.query.donorType;
    if (req.query.isActive !== undefined) filter.isActive = req.query.isActive;
    
    if (req.query.search) {
      filter.$or = [
        { firstName: { $regex: req.query.search, $options: 'i' } },
        { lastName: { $regex: req.query.search, $options: 'i' } },
        { email: { $regex: req.query.search, $options: 'i' } }
      ];
    }
    const donors = await Donor.find(filter)
      .sort({ lastName: 1, firstName: 1 })
      .skip(skip)
      .limit(limit);
    const total = await Donor.countDocuments(filter);
    res.json({
      donors,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: limit
      }
    });
  } catch (error) {
    console.error('Get donors error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});
router.post('/', managerAuth, [
  body('firstName').trim().isLength({ min: 1 }).withMessage('First name is required'),
  body('lastName').trim().isLength({ min: 1 }).withMessage('Last name is required'),
  body('email').isEmail().normalizeEmail().withMessage('Please enter a valid email'),
  body('phone').optional().trim(),
  body('donorType').optional().isIn(['individual', 'corporate', 'foundation']),
  body('isAnonymous').optional().isBoolean(),
  body('dateOfBirth').optional().isISO8601().withMessage('Invalid date format'),
  body('address.street').optional().trim(),
  body('address.city').optional().trim(),
  body('address.state').optional().trim(),
  body('address.zipCode').optional().trim(),
  body('address.country').optional().trim(),
  body('notes').optional().trim(),
  body('tags').optional().isArray()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      firstName,
      lastName,
      email,
      phone,
      donorType = 'individual',
      isAnonymous = false,
      dateOfBirth,
      address,
      notes,
      tags = []
    } = req.body;
    const existingDonor = await Donor.findOne({ email });
    if (existingDonor) {
      return res.status(400).json({ message: 'Donor with this email already exists' });
    }

    const donor = new Donor({
      firstName,
      lastName,
      email,
      phone,
      donorType,
      isAnonymous,
      dateOfBirth,
      address,
      notes,
      tags
    });

    await donor.save();

    res.status(201).json({
      message: 'Donor created successfully',
      donor
    });
  } catch (error) {
    console.error('Create donor error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});
router.get('/:id', auth, async (req, res) => {
  try {
    const donor = await Donor.findById(req.params.id);

    if (!donor) {
      return res.status(404).json({ message: 'Donor not found' });
    }

    res.json({ donor });
  } catch (error) {
    console.error('Get donor error:', error);
    if (error.kind === 'ObjectId') {
      return res.status(400).json({ message: 'Invalid donor ID' });
    }
    res.status(500).json({ message: 'Server error' });
  }
});
router.put('/:id', managerAuth, [
  body('firstName').optional().trim().isLength({ min: 1 }).withMessage('First name cannot be empty'),
  body('lastName').optional().trim().isLength({ min: 1 }).withMessage('Last name cannot be empty'),
  body('email').optional().isEmail().normalizeEmail().withMessage('Please enter a valid email'),
  body('phone').optional().trim(),
  body('donorType').optional().isIn(['individual', 'corporate', 'foundation']),
  body('isAnonymous').optional().isBoolean(),
  body('dateOfBirth').optional().isISO8601().withMessage('Invalid date format'),
  body('address.street').optional().trim(),
  body('address.city').optional().trim(),
  body('address.state').optional().trim(),
  body('address.zipCode').optional().trim(),
  body('address.country').optional().trim(),
  body('notes').optional().trim(),
  body('tags').optional().isArray(),
  body('isActive').optional().isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const updateFields = { ...req.body };
    if (updateFields.email) {
      const existingDonor = await Donor.findOne({ 
        email: updateFields.email, 
        _id: { $ne: req.params.id } 
      });
      if (existingDonor) {
        return res.status(400).json({ message: 'Email is already in use by another donor' });
      }
    }

    const donor = await Donor.findByIdAndUpdate(
      req.params.id,
      updateFields,
      { new: true, runValidators: true }
    );

    if (!donor) {
      return res.status(404).json({ message: 'Donor not found' });
    }

    res.json({
      message: 'Donor updated successfully',
      donor
    });
  } catch (error) {
    console.error('Update donor error:', error);
    if (error.kind === 'ObjectId') {
      return res.status(400).json({ message: 'Invalid donor ID' });
    }
    res.status(500).json({ message: 'Server error' });
  }
});
router.delete('/:id', managerAuth, async (req, res) => {
  try {
    const donor = await Donor.findById(req.params.id);
    
    if (!donor) {
      return res.status(404).json({ message: 'Donor not found' });
    }
    donor.isActive = false;
    await donor.save();

    res.json({ message: 'Donor deactivated successfully' });
  } catch (error) {
    console.error('Delete donor error:', error);
    if (error.kind === 'ObjectId') {
      return res.status(400).json({ message: 'Invalid donor ID' });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router; 