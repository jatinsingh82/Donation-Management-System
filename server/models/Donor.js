const mongoose = require('mongoose');

const donorSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: [true, 'First name is required'],
    trim: true
  },
  lastName: {
    type: String,
    required: [true, 'Last name is required'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  phone: {
    type: String,
    trim: true
  },
  address: {
    street: String,
    city: String,
    state: String,
    zipCode: String,
    country: {
      type: String,
      default: 'USA'
    }
  },
  dateOfBirth: {
    type: Date
  },
  donorType: {
    type: String,
    enum: ['individual', 'corporate', 'foundation'],
    default: 'individual'
  },
  isAnonymous: {
    type: Boolean,
    default: false
  },
  totalDonated: {
    type: Number,
    default: 0
  },
  lastDonationDate: {
    type: Date
  },
  notes: {
    type: String,
    trim: true
  },
  tags: [{
    type: String,
    trim: true
  }],
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});
donorSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});
donorSchema.index({ email: 1 });
donorSchema.index({ lastName: 1, firstName: 1 });
donorSchema.index({ donorType: 1 });

module.exports = mongoose.model('Donor', donorSchema); 