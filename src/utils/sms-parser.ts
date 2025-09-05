// M-Pesa SMS Parser for Kenyan M-Pesa messages
// Handles various M-Pesa SMS formats and extracts transaction data

export interface ParsedTransaction {
  amount: number;
  customerName: string;
  transactionReference: string;
  time: string;
  phoneNumber?: string;
  accountBalance?: number;
  transactionCost?: number;
  isValid: boolean;
  errorMessage?: string;
}

export function parseMpesaSMS(smsContent: string): ParsedTransaction {
  try {
    // Clean up the SMS content
    const cleanSMS = smsContent.trim().replace(/\s+/g, ' ');
    
    // Initialize result object
    const result: ParsedTransaction = {
      amount: 0,
      customerName: '',
      transactionReference: '',
      time: '',
      isValid: false
    };

    // Pattern 1: Standard M-Pesa business SMS
    // "NLJ7RT545 Confirmed. Ksh500.00 received from JOHN KAMAU 254722123456. Account balance is Ksh15,430.00. Transaction cost, Ksh0.00. Time: 14/01/25 2:15 PM"
    
    // Extract transaction reference (usually at the beginning)
    const refMatch = cleanSMS.match(/^([A-Z0-9]{8,12})\s+Confirmed/i);
    if (refMatch) {
      result.transactionReference = refMatch[1];
    }

    // Extract amount - various patterns
    const amountPatterns = [
      /Ksh([\d,]+\.?\d*)\s+received/i,
      /received.*?Ksh([\d,]+\.?\d*)/i,
      /Amount.*?Ksh([\d,]+\.?\d*)/i,
      /Ksh\s*([\d,]+\.?\d*)/i
    ];

    for (const pattern of amountPatterns) {
      const amountMatch = cleanSMS.match(pattern);
      if (amountMatch) {
        const amountStr = amountMatch[1].replace(/,/g, '');
        result.amount = parseFloat(amountStr);
        break;
      }
    }

    // Extract customer name - between "from" and phone number
    const namePatterns = [
      /received from\s+([A-Z\s]+?)\s+254/i,
      /from\s+([A-Z\s]+?)\s+254/i,
      /sent by\s+([A-Z\s]+?)\s+254/i,
      /received from\s+([A-Z\s]+?)\s*\./i
    ];

    for (const pattern of namePatterns) {
      const nameMatch = cleanSMS.match(pattern);
      if (nameMatch) {
        result.customerName = nameMatch[1].trim();
        break;
      }
    }

    // Extract phone number
    const phoneMatch = cleanSMS.match(/(254\d{9})/);
    if (phoneMatch) {
      result.phoneNumber = phoneMatch[1];
    }

    // Extract time - various formats
    const timePatterns = [
      /Time:\s*(\d{1,2}:\d{2}\s*(?:AM|PM))/i,
      /at\s*(\d{1,2}:\d{2}\s*(?:AM|PM))/i,
      /(\d{1,2}:\d{2}\s*(?:AM|PM))/i
    ];

    for (const pattern of timePatterns) {
      const timeMatch = cleanSMS.match(pattern);
      if (timeMatch) {
        result.time = timeMatch[1].trim();
        break;
      }
    }

    // If no AM/PM specified, extract just time and assume 24hr format
    if (!result.time) {
      const timeMatch24 = cleanSMS.match(/(\d{1,2}:\d{2})/);
      if (timeMatch24) {
        const time24 = timeMatch24[1];
        result.time = convertTo12Hour(time24);
      }
    }

    // Extract account balance
    const balanceMatch = cleanSMS.match(/Account balance.*?Ksh([\d,]+\.?\d*)/i);
    if (balanceMatch) {
      result.accountBalance = parseFloat(balanceMatch[1].replace(/,/g, ''));
    }

    // Extract transaction cost
    const costMatch = cleanSMS.match(/Transaction cost.*?Ksh([\d,]+\.?\d*)/i);
    if (costMatch) {
      result.transactionCost = parseFloat(costMatch[1].replace(/,/g, ''));
    }

    // Validation
    if (result.amount > 0 && result.transactionReference && result.customerName) {
      result.isValid = true;
    } else {
      result.isValid = false;
      result.errorMessage = 'Could not parse essential fields: ';
      const missing = [];
      if (!result.amount) missing.push('amount');
      if (!result.transactionReference) missing.push('reference');
      if (!result.customerName) missing.push('customer name');
      result.errorMessage += missing.join(', ');
    }

    return result;

  } catch (error) {
    return {
      amount: 0,
      customerName: '',
      transactionReference: '',
      time: '',
      isValid: false,
      errorMessage: `Parse error: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

// Helper function to convert 24hr time to 12hr format
function convertTo12Hour(time24: string): string {
  const [hours, minutes] = time24.split(':');
  const hour24 = parseInt(hours);
  
  if (hour24 === 0) {
    return `12:${minutes} AM`;
  } else if (hour24 < 12) {
    return `${hour24}:${minutes} AM`;
  } else if (hour24 === 12) {
    return `12:${minutes} PM`;
  } else {
    return `${hour24 - 12}:${minutes} PM`;
  }
}

// Parse multiple SMS messages from a text block
export function parseMultipleSMS(smsBlock: string): ParsedTransaction[] {
  // Split by common SMS delimiters
  const messages = smsBlock
    .split(/\n\n|\n(?=[A-Z0-9]{8,12}\s+Confirmed)/i)
    .filter(msg => msg.trim().length > 0);

  return messages.map(sms => parseMpesaSMS(sms));
}

// Sample SMS formats for testing
export const SAMPLE_SMS_FORMATS = [
  "NLJ7RT545 Confirmed. Ksh500.00 received from JOHN KAMAU 254722123456. Account balance is Ksh15,430.00. Transaction cost, Ksh0.00. Time: 14/01/25 2:15 PM",
  "NLK8ST661 Confirmed. You have received Ksh200.00 from MARY WANJIKU 254733987654 Account balance is Ksh15,630.00 Transaction cost Ksh0.00 Time 14/01/25 10:45AM",
  "NLM9UV772 Confirmed. Ksh1,200.00 received from PETER MWANGI 254711222333. Your account balance is now Ksh16,830.00. Transaction cost: Ksh0.00. Date: 14/01/25 Time: 11:30 AM"
];

// Validate M-Pesa transaction reference format
export function isValidMpesaReference(reference: string): boolean {
  // M-Pesa references are typically 10 characters, alphanumeric, starting with letters
  return /^[A-Z]{2,3}[0-9A-Z]{7,9}$/i.test(reference);
}