// M-Pesa Fee Calculator for Kenyan Business Rates
// Updated rates as per Safaricom current tariffs for Customer-to-Business transactions

export interface FeeStructure {
  minAmount: number;
  maxAmount: number;
  customerFee: number;
  businessFee: number;
  description: string;
}

// Current M-Pesa Customer-to-Business fee structure (2025)
// Most C2B transactions have no charge to the business (only customer pays)
export const MPESA_FEE_STRUCTURE: FeeStructure[] = [
  { minAmount: 1, maxAmount: 49, customerFee: 0, businessFee: 0, description: "KSh 1 - 49" },
  { minAmount: 50, maxAmount: 100, customerFee: 0, businessFee: 0, description: "KSh 50 - 100" },
  { minAmount: 101, maxAmount: 500, customerFee: 0, businessFee: 0, description: "KSh 101 - 500" },
  { minAmount: 501, maxAmount: 1000, customerFee: 0, businessFee: 0, description: "KSh 501 - 1,000" },
  { minAmount: 1001, maxAmount: 1500, customerFee: 0, businessFee: 0, description: "KSh 1,001 - 1,500" },
  { minAmount: 1501, maxAmount: 2500, customerFee: 0, businessFee: 0, description: "KSh 1,501 - 2,500" },
  { minAmount: 2501, maxAmount: 3500, customerFee: 0, businessFee: 0, description: "KSh 2,501 - 3,500" },
  { minAmount: 3501, maxAmount: 5000, customerFee: 0, businessFee: 0, description: "KSh 3,501 - 5,000" },
  { minAmount: 5001, maxAmount: 7500, customerFee: 10, businessFee: 0, description: "KSh 5,001 - 7,500" },
  { minAmount: 7501, maxAmount: 10000, customerFee: 15, businessFee: 0, description: "KSh 7,501 - 10,000" },
  { minAmount: 10001, maxAmount: 15000, customerFee: 20, businessFee: 0, description: "KSh 10,001 - 15,000" },
  { minAmount: 15001, maxAmount: 20000, customerFee: 25, businessFee: 0, description: "KSh 15,001 - 20,000" },
  { minAmount: 20001, maxAmount: 35000, customerFee: 30, businessFee: 0, description: "KSh 20,001 - 35,000" },
  { minAmount: 35001, maxAmount: 50000, customerFee: 50, businessFee: 0, description: "KSh 35,001 - 50,000" },
  { minAmount: 50001, maxAmount: 150000, customerFee: 100, businessFee: 0, description: "KSh 50,001 - 150,000" },
  { minAmount: 150001, maxAmount: 500000, customerFee: 150, businessFee: 0, description: "KSh 150,001 - 500,000" }
];

/**
 * Calculate M-Pesa fee that the business pays (usually KSh 0 for C2B transactions)
 * @param amount Transaction amount in KSh
 * @returns Fee amount in KSh that business pays
 */
export function calculateMpesaBusinessFee(amount: number): number {
  if (amount <= 0) return 0;
  
  const bracket = MPESA_FEE_STRUCTURE.find(
    fee => amount >= fee.minAmount && amount <= fee.maxAmount
  );
  
  return bracket ? bracket.businessFee : 0;
}

/**
 * Calculate M-Pesa fee that the customer pays
 * @param amount Transaction amount in KSh
 * @returns Fee amount in KSh that customer pays
 */
export function calculateMpesaCustomerFee(amount: number): number {
  if (amount <= 0) return 0;
  
  const bracket = MPESA_FEE_STRUCTURE.find(
    fee => amount >= fee.minAmount && amount <= fee.maxAmount
  );
  
  return bracket ? bracket.customerFee : 0;
}

/**
 * Get the fee bracket information for a given amount
 * @param amount Transaction amount in KSh
 * @returns Fee structure object or null if not found
 */
export function getFeeStructure(amount: number): FeeStructure | null {
  if (amount <= 0) return null;
  
  return MPESA_FEE_STRUCTURE.find(
    fee => amount >= fee.minAmount && amount <= fee.maxAmount
  ) || null;
}

/**
 * Calculate net amount received by business after fees
 * @param amount Transaction amount in KSh
 * @returns Net amount after deducting business fees
 */
export function calculateNetAmount(amount: number): number {
  const businessFee = calculateMpesaBusinessFee(amount);
  return Math.max(0, amount - businessFee);
}

/**
 * Get all fee brackets for display purposes
 * @returns Array of all fee structures
 */
export function getAllFeeStructures(): FeeStructure[] {
  return MPESA_FEE_STRUCTURE;
}

/**
 * Calculate total fees for an array of transactions
 * @param amounts Array of transaction amounts
 * @returns Object with total customer fees, business fees, and transaction count
 */
export function calculateBulkFees(amounts: number[]): {
  totalCustomerFees: number;
  totalBusinessFees: number;
  totalTransactions: number;
  totalAmount: number;
  netAmount: number;
} {
  let totalCustomerFees = 0;
  let totalBusinessFees = 0;
  let totalAmount = 0;
  
  amounts.forEach(amount => {
    if (amount > 0) {
      totalAmount += amount;
      totalCustomerFees += calculateMpesaCustomerFee(amount);
      totalBusinessFees += calculateMpesaBusinessFee(amount);
    }
  });
  
  return {
    totalCustomerFees,
    totalBusinessFees,
    totalTransactions: amounts.length,
    totalAmount,
    netAmount: totalAmount - totalBusinessFees
  };
}

/**
 * Format amount as Kenyan Shilling currency
 * @param amount Amount in KSh
 * @returns Formatted string like "KSh 1,234.56"
 */
export function formatKSh(amount: number): string {
  return `KSh ${amount.toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

/**
 * Validate if amount is within M-Pesa limits
 * @param amount Transaction amount
 * @returns Object with validation status and message
 */
export function validateMpesaAmount(amount: number): { isValid: boolean; message: string } {
  if (amount < 1) {
    return { isValid: false, message: "Minimum transaction amount is KSh 1" };
  }
  
  if (amount > 500000) {
    return { isValid: false, message: "Maximum transaction amount is KSh 500,000" };
  }
  
  return { isValid: true, message: "Amount is valid" };
}