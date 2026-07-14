/**
 * Shared validation utilities for form fields
 * Returns empty string for valid, error message string for invalid
 */

export const validateEmail = (email: string): string => {
  if (!email) return "";
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return "Please enter a valid email address";
  }
  return "";
};

export const validatePhone = (phone: string): string => {
  if (!phone) return "";
  // Allow formats: (123) 456-7890, 123-456-7890, 123.456.7890, 1234567890, +1 123 456 7890
  const phoneRegex = /^[\+]?[(]?[0-9]{1,4}[)]?[-\s\.]?[(]?[0-9]{1,4}[)]?[-\s\.]?[0-9]{1,9}$/;
  const digitsOnly = phone.replace(/\D/g, "");
  if (digitsOnly.length < 10 || digitsOnly.length > 15) {
    return "Please enter a valid phone number (10-15 digits)";
  }
  return "";
};

export const validateZipCode = (zip: string): string => {
  if (!zip) return "";
  // US ZIP: 5 digits or 5+4 format (12345 or 12345-6789)
  // International: Allow alphanumeric, 3-10 characters
  const zipRegex = /^[0-9]{5}(-[0-9]{4})?$|^[A-Z0-9]{3,10}$/i;
  if (!zipRegex.test(zip)) {
    return "Please enter a valid zip/postal code";
  }
  return "";
};

export const validateCardNumber = (cardNumber: string): string => {
  if (!cardNumber) return "";
  // Remove spaces and non-digits
  const digitsOnly = cardNumber.replace(/\D/g, "");
  // Credit cards are typically 13-19 digits
  if (digitsOnly.length < 13 || digitsOnly.length > 19) {
    return "Card number must be 13-19 digits";
  }
  // Luhn algorithm validation
  let sum = 0;
  let isEven = false;
  for (let i = digitsOnly.length - 1; i >= 0; i--) {
    let digit = parseInt(digitsOnly[i]);
    if (isEven) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }
    sum += digit;
    isEven = !isEven;
  }
  if (sum % 10 !== 0) {
    return "Please enter a valid card number";
  }
  return "";
};

export const validateCVV = (cvv: string): string => {
  if (!cvv) return "";
  // CVV is typically 3-4 digits
  const cvvRegex = /^[0-9]{3,4}$/;
  if (!cvvRegex.test(cvv)) {
    return "CVV must be 3-4 digits";
  }
  return "";
};

export const validateExpiryDate = (month: string, year: string): string => {
  if (!month || !year) return "";
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth() + 1;
  const expiryYear = parseInt(year);
  const expiryMonth = parseInt(month);
  
  if (expiryYear < currentYear) {
    return "Expiry year cannot be in the past";
  }
  if (expiryYear === currentYear && expiryMonth < currentMonth) {
    return "Expiry date cannot be in the past";
  }
  return "";
};

