const express = require('express');
const { query } = require('express-validator');
const Donation = require('../models/Donation');
const Donor = require('../models/Donor');
const Campaign = require('../models/Campaign');
const { auth } = require('../middleware/auth');
const router = express.Router();
router.get('/dashboard', auth, async (req, res) => {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
    const totalDonations = await Donation.countDocuments();
    const totalAmount = await Donation.aggregate([
      { $match: { paymentStatus: 'completed' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const recentDonations = await Donation.countDocuments({
      createdAt: { $gte: thirtyDaysAgo },
      paymentStatus: 'completed'
    });

    const recentAmount = await Donation.aggregate([
      { 
        $match: { 
          createdAt: { $gte: thirtyDaysAgo },
          paymentStatus: 'completed'
        } 
      },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const totalDonors = await Donor.countDocuments({ isActive: true });
    const newDonors = await Donor.countDocuments({
      createdAt: { $gte: thirtyDaysAgo },
      isActive: true
    });
    const totalCampaigns = await Campaign.countDocuments();
    const activeCampaigns = await Campaign.countDocuments({ status: 'active' });
    const monthlyTrends = await Donation.aggregate([
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
    const paymentMethods = await Donation.aggregate([
      { $match: { paymentStatus: 'completed' } },
      { $group: { _id: '$paymentMethod', count: { $sum: 1 }, amount: { $sum: '$amount' } } },
      { $sort: { amount: -1 } }
    ]);
    const topCampaigns = await Campaign.aggregate([
      { $match: { status: { $in: ['active', 'completed'] } } },
      {
        $project: {
          name: 1,
          goal: 1,
          currentAmount: 1,
          progressPercentage: {
            $multiply: [
              { $divide: ['$currentAmount', '$goal'] },
              100
            ]
          }
        }
      },
      { $sort: { currentAmount: -1 } },
      { $limit: 5 }
    ]);

    res.json({
      summary: {
        totalDonations,
        totalAmount: totalAmount[0]?.total || 0,
        recentDonations,
        recentAmount: recentAmount[0]?.total || 0,
        totalDonors,
        newDonors,
        totalCampaigns,
        activeCampaigns
      },
      trends: {
        monthly: monthlyTrends,
        paymentMethods
      },
      campaigns: {
        topPerformers: topCampaigns
      }
    });
  } catch (error) {
    console.error('Dashboard analytics error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});
router.get('/donations', auth, [
  query('startDate').optional().isISO8601().withMessage('Invalid start date'),
  query('endDate').optional().isISO8601().withMessage('Invalid end date'),
  query('campaign').optional().isMongoId().withMessage('Invalid campaign ID'),
  query('donorType').optional().isIn(['individual', 'corporate', 'foundation'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { startDate, endDate, campaign, donorType } = req.query;
    const matchConditions = { paymentStatus: 'completed' };
    if (startDate || endDate) {
      matchConditions.createdAt = {};
      if (startDate) matchConditions.createdAt.$gte = new Date(startDate);
      if (endDate) matchConditions.createdAt.$lte = new Date(endDate);
    }
    if (campaign) matchConditions.campaign = campaign;
    const pipeline = [{ $match: matchConditions }];
    if (donorType) {
      pipeline.push({
        $lookup: {
          from: 'donors',
          localField: 'donor',
          foreignField: '_id',
          as: 'donorInfo'
        }
      });
      pipeline.push({
        $match: {
          'donorInfo.donorType': donorType
        }
      });
    }
    const totalStats = await Donation.aggregate([
      ...pipeline,
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
          avgAmount: { $avg: '$amount' }
        }
      }
    ]);
    const dailyTrends = await Donation.aggregate([
      ...pipeline,
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' }
          },
          count: { $sum: 1 },
          amount: { $sum: '$amount' }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
    ]);
    const paymentMethods = await Donation.aggregate([
      ...pipeline,
      {
        $group: {
          _id: '$paymentMethod',
          count: { $sum: 1 },
          amount: { $sum: '$amount' }
        }
      },
      { $sort: { amount: -1 } }
    ]);
    const currencies = await Donation.aggregate([
      ...pipeline,
      {
        $group: {
          _id: '$currency',
          count: { $sum: 1 },
          amount: { $sum: '$amount' }
        }
      },
      { $sort: { amount: -1 } }
    ]);

    res.json({
      summary: totalStats[0] || { count: 0, totalAmount: 0, avgAmount: 0 },
      trends: {
        daily: dailyTrends
      },
      distributions: {
        paymentMethods,
        currencies
      }
    });
  } catch (error) {
    console.error('Donation analytics error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});
router.get('/donors', auth, async (req, res) => {
  try {
    const donorTypes = await Donor.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$donorType', count: { $sum: 1 } } }
    ]);
    const donorRetention = await Donation.aggregate([
      { $match: { paymentStatus: 'completed' } },
      { $group: { _id: '$donor', donationCount: { $sum: 1 } } },
      { $group: { _id: '$donationCount', donorCount: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);
    const topDonors = await Donation.aggregate([
      { $match: { paymentStatus: 'completed' } },
      {
        $group: {
          _id: '$donor',
          totalAmount: { $sum: '$amount' },
          donationCount: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: 'donors',
          localField: '_id',
          foreignField: '_id',
          as: 'donorInfo'
        }
      },
      { $unwind: '$donorInfo' },
      {
        $project: {
          donorName: {
            $concat: ['$donorInfo.firstName', ' ', '$donorInfo.lastName']
          },
          totalAmount: 1,
          donationCount: 1,
          donorType: '$donorInfo.donorType'
        }
      },
      { $sort: { totalAmount: -1 } },
      { $limit: 10 }
    ]);
    const newDonorsTrend = await Donor.aggregate([
      { $match: { isActive: true } },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': -1, '_id.month': -1 } },
      { $limit: 12 }
    ]);

    res.json({
      donorTypes,
      retention: donorRetention,
      topDonors,
      newDonorsTrend
    });
  } catch (error) {
    console.error('Donor analytics error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});
router.get('/campaigns', auth, async (req, res) => {
  try {
    const statusDistribution = await Campaign.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    const categoryPerformance = await Campaign.aggregate([
      { $match: { status: { $in: ['active', 'completed'] } } },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          totalGoal: { $sum: '$goal' },
          totalRaised: { $sum: '$currentAmount' }
        }
      },
      {
        $project: {
          count: 1,
          totalGoal: 1,
          totalRaised: 1,
          successRate: {
            $multiply: [
              { $divide: ['$totalRaised', '$totalGoal'] },
              100
            ]
          }
        }
      },
      { $sort: { totalRaised: -1 } }
    ]);
    const completionRates = await Campaign.aggregate([
      { $match: { status: 'completed' } },
      {
        $group: {
          _id: null,
          totalCompleted: { $sum: 1 },
          avgGoal: { $avg: '$goal' },
          avgRaised: { $avg: '$currentAmount' }
        }
      }
    ]);
    const topCampaigns = await Campaign.find({ status: { $in: ['active', 'completed'] } })
      .sort({ currentAmount: -1 })
      .limit(10)
      .select('name category goal currentAmount status startDate endDate');

    res.json({
      statusDistribution,
      categoryPerformance,
      completionRates: completionRates[0] || {},
      topCampaigns
    });
  } catch (error) {
    console.error('Campaign analytics error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router; 