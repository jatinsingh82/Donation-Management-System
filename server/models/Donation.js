const mongoose = require('mongoose');
const donationSchema = new mongoose.Schema({
  donor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Donor',
    required: [true, 'Donor is required']
  },
  campaign: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Campaign'
  },
  amount: {
    type: Number,
    required: [true, 'Donation amount is required'],
    min: [0.01, 'Amount must be greater than 0']
  },
  currency: {
    type: String,
    default: 'USD',
    enum: ['USD', 'EUR', 'GBP', 'CAD', 'AUD']
  },
  paymentMethod: {
    type: String,
    required: [true, 'Payment method is required'],
    enum: ['credit_card', 'debit_card', 'bank_transfer', 'check', 'cash', 'paypal', 'stripe', 'other']
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'refunded', 'cancelled'],
    default: 'pending'
  },
  transactionId: {
    type: String,
    unique: true,
    sparse: true
  },
  isAnonymous: {
    type: Boolean,
    default: false
  },
  isRecurring: {
    type: Boolean,
    default: false
  },
  recurringFrequency: {
    type: String,
    enum: ['weekly', 'monthly', 'quarterly', 'yearly'],
    default: null
  },
  message: {
    type: String,
    trim: true
  },
  receiptSent: {
    type: Boolean,
    default: false
  },
  receiptSentAt: {
    type: Date
  },
  notes: {
    type: String,
    trim: true
  },
  processedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  tags: [{
    type: String,
    trim: true
  }]
}, {
  timestamps: true
});
donationSchema.virtual('formattedAmount').get(function() {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: this.currency
  }).format(this.amount);
});
donationSchema.pre('save', function(next) {
  if (!this.transactionId) {
    this.transactionId = `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  next();
});
donationSchema.post('save', async function(doc) {
  try {
    const Donor = mongoose.model('Donor');
    const donor = await Donor.findById(doc.donor);
    if (donor) {
      donor.totalDonated += doc.amount;
      donor.lastDonationDate = new Date();
      await donor.save();
    }
    if (doc.campaign) {
      const Campaign = mongoose.model('Campaign');
      const campaign = await Campaign.findById(doc.campaign);
      if (campaign) {
        campaign.currentAmount += doc.amount;
        await campaign.save();
      }
    }
  } catch (error) {
    console.error('Error updating totals:', error);
  }
});
donationSchema.index({ donor: 1, createdAt: -1 });
donationSchema.index({ campaign: 1, createdAt: -1 });
donationSchema.index({ paymentStatus: 1 });
donationSchema.index({ createdAt: -1 });
donationSchema.index({ transactionId: 1 });

module.exports = mongoose.model('Donation', donationSchema); 