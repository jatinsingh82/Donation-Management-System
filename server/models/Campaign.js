const mongoose = require('mongoose');
const campaignSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Campaign name is required'],
    trim: true
  },
  description: {
    type: String,
    required: [true, 'Campaign description is required'],
    trim: true
  },
  goal: {
    type: Number,
    required: [true, 'Campaign goal is required'],
    min: [0, 'Goal must be positive']
  },
  currentAmount: {
    type: Number,
    default: 0,
    min: [0, 'Current amount cannot be negative']
  },
  startDate: {
    type: Date,
    required: [true, 'Start date is required']
  },
  endDate: {
    type: Date,
    required: [true, 'End date is required']
  },
  status: {
    type: String,
    enum: ['draft', 'active', 'paused', 'completed', 'cancelled'],
    default: 'draft'
  },
  category: {
    type: String,
    required: [true, 'Campaign category is required'],
    enum: ['education', 'healthcare', 'environment', 'poverty', 'disaster-relief', 'arts', 'other']
  },
  image: {
    type: String
  },
  organizer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  tags: [{
    type: String,
    trim: true
  }],
  isFeatured: {
    type: Boolean,
    default: false
  },
  isPublic: {
    type: Boolean,
    default: true
  },
  notes: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});
campaignSchema.virtual('progressPercentage').get(function() {
  if (this.goal === 0) return 0;
  return Math.min((this.currentAmount / this.goal) * 100, 100);
});
campaignSchema.virtual('daysRemaining').get(function() {
  const now = new Date();
  const end = new Date(this.endDate);
  const diffTime = end - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
});
campaignSchema.virtual('isActive').get(function() {
  const now = new Date();
  const start = new Date(this.startDate);
  const end = new Date(this.endDate);
  return now >= start && now <= end && this.status === 'active';
});
campaignSchema.index({ status: 1 });
campaignSchema.index({ category: 1 });
campaignSchema.index({ startDate: 1, endDate: 1 });
campaignSchema.index({ isFeatured: 1 });

module.exports = mongoose.model('Campaign', campaignSchema); 