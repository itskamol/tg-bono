# Implementation Plan

- [x] 1. Update Prisma schema for mixed payments
  - Add new Payment model with order relationship
  - Update Order model to include payments relation
  - Remove single payment_type field from Order model
  - Generate and apply database migration
  - _Requirements: 4.1, 4.2_

- [x] 2. Update TypeScript interfaces and types
  - Create PaymentEntry interface for payment data structure
  - Update NewOrderSceneState interface with payment fields
  - Add payment-related state management properties
  - _Requirements: 1.1, 3.1_

- [x] 3. Implement payment calculation utilities
  - Create function to calculate remaining amount from payments array
  - Create function to validate payment amounts
  - Create function to check if payment is complete
  - Write unit tests for payment calculation logic
  - _Requirements: 3.1, 3.2, 3.3_

- [x] 4. Refactor existing payment flow in new-order.scene.ts
  - Remove single payment type selection logic
  - Update onPayment method to initialize mixed payment flow
  - Modify payment confirmation to handle multiple payments
  - _Requirements: 1.1, 1.2_

- [x] 5. Implement payment type selection interface
  - Create showPaymentTypeSelection method with inline keyboard
  - Handle payment type selection actions (PAYMENT_TYPE_CASH, etc.)
  - Add back navigation from payment type selection
  - _Requirements: 1.1, 2.1, 2.2_

- [x] 6. Implement payment amount selection interface
  - Create showPaymentAmountSelection method with "Hammasini" and "Boshqa miqdor" options
  - Handle "Hammasini" action to use full remaining amount
  - Handle "Boshqa miqdor" action to prompt for custom amount input
  - Add back navigation to payment type selection
  - _Requirements: 1.2, 1.3, 2.1, 2.2_

- [x] 7. Implement custom payment amount input handling
  - Add payment amount input state management in onText method
  - Validate entered amount (positive, not exceeding remaining amount)
  - Show error messages for invalid amounts
  - Add payment to payments array after successful validation
  - _Requirements: 1.4, 3.2, 3.3_

- [x] 8. Create payment summary display functionality
  - Create showPaymentSummary method to display current payments
  - Show remaining amount and total amount
  - Provide options to add more payments or complete order
  - Handle navigation back to payment type selection
  - _Requirements: 1.4, 1.5, 3.1_

- [x] 9. Implement payment completion logic
  - Check if all amount is paid before allowing confirmation
  - Show final order summary with all payment details
  - Handle order confirmation with multiple payments
  - _Requirements: 1.5, 4.1_

- [x] 10. Update database order creation logic
  - Modify onConfirmOrder method to create Order without payment_type
  - Create multiple Payment records for each payment in payments array
  - Use Prisma transaction to ensure data consistency
  - Handle database errors appropriately
  - _Requirements: 4.1, 4.2_

- [x] 11. Add payment cancellation and back navigation
  - Implement ability to remove last added payment
  - Add "Orqaga" functionality throughout payment flow
  - Handle payment flow cancellation with confirmation
  - _Requirements: 2.1, 2.2, 5.1, 5.2, 5.3_

- [x] 12. Update order display and summary formatting
  - Modify order summary text to show multiple payment types
  - Update payment display formatting with emojis and clear layout
  - Ensure all payment information is clearly visible
  - _Requirements: 4.2, 3.1_

- [x] 13. Add comprehensive error handling
  - Handle edge cases in payment amount validation
  - Add proper error messages for payment flow issues
  - Implement graceful fallbacks for payment errors
  - _Requirements: 3.2, 3.3_

- [x] 14. Write integration tests for mixed payment flow
  - Test complete mixed payment scenario (multiple payment types)
  - Test payment validation edge cases
  - Test back navigation functionality
  - Test payment cancellation scenarios
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2_

- [x] 15. Update existing order queries and displays
  - Modify any existing code that reads payment_type from Order
  - Update order listing to show payment breakdown
  - Ensure backward compatibility where possible
  - _Requirements: 4.2_