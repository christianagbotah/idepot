-- PUBLIC-SAFE LEGACY SCHEMA REFERENCE ONLY: zero client records; do not restore over production.
-- Owner-supplied schema-only `depot.sql` from 2026-11-06; host and database name redacted.
-- See legacy/intake/2026-11-06/README.md for provenance, migration limitations and usage.
-- phpMyAdmin SQL Dump
-- version 5.2.3
-- https://www.phpmyadmin.net/
--
-- Host: [redacted schema-only reference]
-- Generation Time: Nov 06, 2026 at 07:43 AM
-- Server version: 11.8.8-MariaDB
-- PHP Version: 7.4.33

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `legacy_depot_schema_reference`
--

-- --------------------------------------------------------

--
-- Table structure for table `accounts`
--

CREATE TABLE `accounts` (
  `account_id` int(11) NOT NULL,
  `name` longtext NOT NULL,
  `account_type` int(11) NOT NULL,
  `opening_balance` double DEFAULT 0,
  `current_balance` double DEFAULT 0,
  `account_is_bank` int(11) NOT NULL DEFAULT 0,
  `account_is_transferrable` int(11) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `accounts_payable`
--

CREATE TABLE `accounts_payable` (
  `accounts_payable_id` int(11) NOT NULL,
  `supplier_id` int(11) DEFAULT NULL,
  `po_code` longtext DEFAULT NULL,
  `amount` double DEFAULT 0,
  `amount_paid` double DEFAULT 0,
  `amount_due` double DEFAULT 0,
  `creation_timestamp` longtext DEFAULT NULL,
  `payment_timestamp` longtext DEFAULT NULL,
  `date` longtext DEFAULT NULL,
  `timestamp` longtext DEFAULT NULL,
  `payment_method` longtext DEFAULT NULL,
  `payment_details` longtext DEFAULT NULL,
  `account_id` int(11) DEFAULT NULL,
  `status` longtext DEFAULT NULL,
  `track_code` longtext DEFAULT NULL,
  `p_prev_paid` double NOT NULL DEFAULT 0,
  `prev_paid` double NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `accounts_used`
--

CREATE TABLE `accounts_used` (
  `id` int(11) NOT NULL,
  `account_id` int(11) NOT NULL,
  `receipt_code` mediumtext NOT NULL,
  `customer_id` int(11) NOT NULL,
  `amount` double NOT NULL DEFAULT 0,
  `account_balance` double NOT NULL DEFAULT 0,
  `created_date` datetime DEFAULT NULL,
  `date_timestamp` mediumtext NOT NULL,
  `timestamp` text NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;

-- --------------------------------------------------------

--
-- Table structure for table `account_type`
--

CREATE TABLE `account_type` (
  `account_type_id` int(11) NOT NULL,
  `name` longtext NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `admin`
--

CREATE TABLE `admin` (
  `admin_id` int(11) NOT NULL,
  `name` longtext DEFAULT NULL,
  `phone` longtext DEFAULT NULL,
  `designation` longtext DEFAULT NULL,
  `email` longtext DEFAULT NULL,
  `password` longtext DEFAULT NULL,
  `level` longtext DEFAULT NULL,
  `manager` enum('0','1') NOT NULL DEFAULT '0',
  `authentication_key` longtext DEFAULT NULL,
  `read_notice_ids` varchar(255) DEFAULT '0',
  `block_limit` int(11) DEFAULT 0,
  `active_status` enum('1','0') NOT NULL DEFAULT '1',
  `online_status` enum('1','0') NOT NULL DEFAULT '0',
  `welcome_shown_date` date DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `attendance`
--

CREATE TABLE `attendance` (
  `attendance_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `date_timestamp` int(20) NOT NULL,
  `in_timestamp` int(20) DEFAULT NULL,
  `out_timestamp` int(20) DEFAULT NULL,
  `status` int(11) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `audit_log`
--

CREATE TABLE `audit_log` (
  `log_id` bigint(20) NOT NULL,
  `admin_id` int(11) NOT NULL,
  `action` varchar(100) NOT NULL,
  `entity_type` varchar(50) DEFAULT NULL,
  `entity_id` int(11) DEFAULT NULL,
  `old_values` longtext DEFAULT NULL,
  `new_values` longtext DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `balance_sheet`
--

CREATE TABLE `balance_sheet` (
  `id` int(11) NOT NULL,
  `type` longtext DEFAULT NULL,
  `date` longtext DEFAULT NULL,
  `timestamp` longtext DEFAULT NULL,
  `name` longtext DEFAULT NULL,
  `amount` double NOT NULL DEFAULT 0,
  `description` longtext DEFAULT NULL,
  `sub_total` double NOT NULL DEFAULT 0,
  `total` double NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `cash_deposit_disbursement`
--

CREATE TABLE `cash_deposit_disbursement` (
  `deposit_id` int(11) NOT NULL,
  `so_code` text NOT NULL,
  `invoice_code` text NOT NULL,
  `deposit_code` text NOT NULL,
  `amount` double NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `ci_sessions`
--

CREATE TABLE `ci_sessions` (
  `id` varchar(40) NOT NULL,
  `ip_address` varchar(45) NOT NULL,
  `timestamp` int(10) UNSIGNED NOT NULL DEFAULT 0,
  `data` blob NOT NULL,
  `user_id` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `creditors`
--

CREATE TABLE `creditors` (
  `creditor_id` int(11) NOT NULL,
  `creditor_type` text DEFAULT NULL,
  `creditor_type_id` int(11) NOT NULL,
  `timestamp` text DEFAULT NULL,
  `amount` double NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;

-- --------------------------------------------------------

--
-- Table structure for table `customers`
--

CREATE TABLE `customers` (
  `customer_id` int(11) NOT NULL,
  `customer_name` longtext NOT NULL,
  `contact_person` longtext NOT NULL,
  `address` longtext NOT NULL,
  `mobile` tinytext DEFAULT NULL,
  `phone` tinytext DEFAULT NULL,
  `email` tinytext NOT NULL,
  `customer_active` int(11) NOT NULL DEFAULT 0,
  `guest` enum('0','1') NOT NULL DEFAULT '0',
  `opening_balance` double DEFAULT 0,
  `balance_due` double NOT NULL DEFAULT 0,
  `date` longtext DEFAULT NULL,
  `timestamp` longtext DEFAULT NULL,
  `opening_accounts_receivable_id` int(11) DEFAULT NULL,
  `opening_accounts_goods_payable_id` int(11) DEFAULT NULL,
  `opening_accounts_goods_receivable_id` int(11) DEFAULT NULL,
  `opening_so_code` longtext DEFAULT NULL,
  `debtor_opening_so_code` longtext DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `customer_loyalty`
--

CREATE TABLE `customer_loyalty` (
  `loyalty_id` int(11) NOT NULL,
  `customer_id` int(11) NOT NULL,
  `tier_id` int(11) DEFAULT 1,
  `total_points` int(11) DEFAULT 0,
  `lifetime_purchases` decimal(15,2) DEFAULT 0.00,
  `total_orders` int(11) DEFAULT 0,
  `last_purchase_date` date DEFAULT NULL,
  `tier_updated_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `customer_rewards`
--

CREATE TABLE `customer_rewards` (
  `reward_id` int(11) NOT NULL,
  `customer_id` int(11) NOT NULL,
  `reward_type` enum('discount','voucher','gift','cashback') DEFAULT 'discount',
  `reward_value` decimal(10,2) NOT NULL,
  `reward_code` varchar(50) NOT NULL,
  `description` text DEFAULT NULL,
  `min_purchase` decimal(10,2) DEFAULT 0.00,
  `expiry_date` date DEFAULT NULL,
  `is_redeemed` tinyint(1) DEFAULT 0,
  `redeemed_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `customer_segments`
--

CREATE TABLE `customer_segments` (
  `segment_id` int(11) NOT NULL,
  `segment_name` varchar(100) NOT NULL,
  `segment_type` enum('high_value','frequent','at_risk','dormant','new') NOT NULL,
  `criteria_json` text DEFAULT NULL,
  `customer_count` int(11) DEFAULT 0,
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `customer_tiers`
--

CREATE TABLE `customer_tiers` (
  `tier_id` int(11) NOT NULL,
  `tier_name` varchar(50) NOT NULL,
  `min_purchases` decimal(10,2) DEFAULT 0.00,
  `discount_percentage` decimal(5,2) DEFAULT 0.00,
  `points_multiplier` decimal(3,2) DEFAULT 1.00,
  `color_code` varchar(7) DEFAULT '#6c757d'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `debtors`
--

CREATE TABLE `debtors` (
  `debtor_id` int(11) NOT NULL,
  `debtor_type` text DEFAULT NULL,
  `debtor_type_id` int(11) DEFAULT NULL,
  `timestamp` text DEFAULT NULL,
  `amount` double NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;

-- --------------------------------------------------------

--
-- Table structure for table `general_journal`
--

CREATE TABLE `general_journal` (
  `journal_id` int(11) NOT NULL,
  `date_timestamp` longtext NOT NULL,
  `timestamp` longtext NOT NULL,
  `date` longtext NOT NULL,
  `journal` longtext DEFAULT NULL,
  `reference` longtext DEFAULT NULL,
  `description` longtext DEFAULT NULL,
  `po_code` longtext DEFAULT NULL,
  `so_code` longtext DEFAULT NULL,
  `invoice_code` longtext DEFAULT NULL,
  `token_no` longtext DEFAULT NULL,
  `item_transfer_receiver` longtext DEFAULT NULL,
  `supplier_id` int(11) DEFAULT NULL,
  `customer_id` int(11) DEFAULT NULL,
  `payment_id` int(11) DEFAULT 0,
  `expenditure_item` longtext DEFAULT NULL,
  `debt_id` int(11) DEFAULT NULL,
  `debit_amount` double NOT NULL DEFAULT 0,
  `credit_amount` double NOT NULL DEFAULT 0,
  `account_name` longtext DEFAULT NULL,
  `account_balance` double NOT NULL DEFAULT 0,
  `receipt_id` int(11) DEFAULT NULL,
  `sales_person_id` int(11) DEFAULT NULL,
  `debtor_balance` double NOT NULL DEFAULT 0,
  `creditor_balance` double NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `invoice`
--

CREATE TABLE `invoice` (
  `invoice_id` int(11) NOT NULL,
  `invoice_code` longtext DEFAULT NULL,
  `customer_id` int(11) DEFAULT NULL,
  `debt_id` int(11) DEFAULT NULL,
  `sales_person_id` int(11) DEFAULT NULL,
  `account_id` int(11) DEFAULT NULL,
  `type_of_payment` longtext DEFAULT NULL,
  `so_code` longtext DEFAULT NULL,
  `description` longtext DEFAULT NULL,
  `amount` double NOT NULL DEFAULT 0,
  `discount` double NOT NULL DEFAULT 0,
  `amount_paid` double NOT NULL DEFAULT 0,
  `amount_due` double NOT NULL DEFAULT 0,
  `timestamp` longtext DEFAULT NULL,
  `creation_timestamp` longtext DEFAULT NULL,
  `payment_timestamp` longtext DEFAULT NULL,
  `date` longtext NOT NULL,
  `payment_method` longtext DEFAULT NULL,
  `payment_details` longtext DEFAULT NULL,
  `status` longtext DEFAULT NULL,
  `track_code` longtext DEFAULT NULL,
  `p_prev_paid` double NOT NULL DEFAULT 0,
  `prev_paid` double NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `invoice_code`
--

CREATE TABLE `invoice_code` (
  `id` int(11) NOT NULL,
  `code` mediumtext NOT NULL,
  `created_date` datetime NOT NULL DEFAULT current_timestamp(),
  `modified_date` datetime DEFAULT NULL,
  `created_by` int(11) NOT NULL,
  `modified_by` int(11) DEFAULT NULL,
  `status` enum('open','closed','not used') NOT NULL DEFAULT 'open',
  `reason_not_used` longtext DEFAULT NULL,
  `code_range` text NOT NULL,
  `customer_id` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;

-- --------------------------------------------------------

--
-- Table structure for table `items`
--

CREATE TABLE `items` (
  `item_id` int(11) NOT NULL,
  `shop_id` int(11) DEFAULT NULL,
  `supplier_id` int(11) NOT NULL,
  `category_id` int(11) NOT NULL,
  `item_name` longtext NOT NULL,
  `description` longtext DEFAULT NULL,
  `selling_price` double NOT NULL DEFAULT 0,
  `purchase_price` double NOT NULL DEFAULT 0,
  `quantity` float NOT NULL DEFAULT 0,
  `unit_quantity` float NOT NULL DEFAULT 0,
  `last_used_timestamp` longtext DEFAULT NULL,
  `last_modified` longtext DEFAULT NULL,
  `modified_user` int(11) DEFAULT NULL,
  `timestamp` longtext DEFAULT NULL,
  `po_id` int(11) DEFAULT NULL,
  `price_column` text DEFAULT NULL,
  `item_sold_in_units` enum('0','1') NOT NULL DEFAULT '0',
  `package_id` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `items_in_units_order`
--

CREATE TABLE `items_in_units_order` (
  `id` int(11) NOT NULL,
  `item_id` int(11) NOT NULL,
  `unit_id` int(11) NOT NULL,
  `customer_id` int(11) NOT NULL,
  `quantity` double NOT NULL DEFAULT 0,
  `unit_price` double NOT NULL DEFAULT 0,
  `total_amount` double NOT NULL DEFAULT 0,
  `unit_balance` double DEFAULT 0,
  `sales_order_code` longtext DEFAULT NULL,
  `created_date` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_date` datetime NOT NULL,
  `timestamp` date DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;

-- --------------------------------------------------------

--
-- Table structure for table `items_prices`
--

CREATE TABLE `items_prices` (
  `prices_id` int(11) NOT NULL,
  `item_id` int(11) NOT NULL,
  `item_price` double NOT NULL DEFAULT 0,
  `customer_id` int(11) NOT NULL,
  `created_date` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_date` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;

-- --------------------------------------------------------

--
-- Table structure for table `items_transfers`
--

CREATE TABLE `items_transfers` (
  `t_id` int(11) NOT NULL,
  `item_id` int(11) NOT NULL,
  `date_timestamp` longtext DEFAULT NULL,
  `date` longtext NOT NULL,
  `timestamp` longtext DEFAULT NULL,
  `token_no` longtext DEFAULT NULL,
  `receiver` longtext DEFAULT NULL,
  `sales_person_id` int(11) DEFAULT NULL,
  `quantity` longtext DEFAULT NULL,
  `total_quantity` longtext DEFAULT NULL,
  `price` double NOT NULL DEFAULT 0,
  `item_balance` double NOT NULL DEFAULT 0,
  `html_id` longtext DEFAULT NULL,
  `journal_debit_id` int(11) DEFAULT NULL,
  `journal_credit_id` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `items_units_prices`
--

CREATE TABLE `items_units_prices` (
  `prices_id` int(11) NOT NULL,
  `unit_id` int(11) NOT NULL,
  `item_id` int(11) NOT NULL,
  `item_price` double NOT NULL DEFAULT 0,
  `customer_id` int(11) NOT NULL,
  `created_date` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_date` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;

-- --------------------------------------------------------

--
-- Table structure for table `item_category`
--

CREATE TABLE `item_category` (
  `category_id` int(11) NOT NULL,
  `main_id` int(11) NOT NULL,
  `category_name` longtext NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `item_locations`
--

CREATE TABLE `item_locations` (
  `location_id` int(11) NOT NULL,
  `item_id` int(11) NOT NULL,
  `shop_id` int(11) NOT NULL,
  `shelf_id` int(11) NOT NULL,
  `row_number` int(11) NOT NULL,
  `column_number` int(11) NOT NULL,
  `quantity` decimal(10,2) DEFAULT 0.00,
  `last_updated` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `item_main_category`
--

CREATE TABLE `item_main_category` (
  `category_id` int(11) NOT NULL,
  `category_name` longtext NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `kpi_snapshots`
--

CREATE TABLE `kpi_snapshots` (
  `snapshot_id` int(11) NOT NULL,
  `snapshot_date` date NOT NULL,
  `total_revenue` decimal(15,2) DEFAULT 0.00,
  `total_orders` int(11) DEFAULT 0,
  `total_customers` int(11) DEFAULT 0,
  `new_customers` int(11) DEFAULT 0,
  `avg_order_value` decimal(10,2) DEFAULT 0.00,
  `total_items_sold` int(11) DEFAULT 0,
  `gross_profit` decimal(15,2) DEFAULT 0.00,
  `profit_margin` decimal(5,2) DEFAULT 0.00,
  `inventory_value` decimal(15,2) DEFAULT 0.00,
  `low_stock_items` int(11) DEFAULT 0,
  `out_of_stock_items` int(11) DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `language`
--

CREATE TABLE `language` (
  `phrase_id` int(11) NOT NULL,
  `phrase` longtext DEFAULT NULL,
  `english` longtext DEFAULT NULL,
  `bengali` longtext DEFAULT NULL,
  `spanish` longtext DEFAULT NULL,
  `arabic` longtext DEFAULT NULL,
  `dutch` longtext DEFAULT NULL,
  `russian` longtext DEFAULT NULL,
  `chinese` longtext DEFAULT NULL,
  `turkish` longtext DEFAULT NULL,
  `portuguese` longtext DEFAULT NULL,
  `hungarian` longtext DEFAULT NULL,
  `french` longtext DEFAULT NULL,
  `greek` longtext DEFAULT NULL,
  `german` longtext DEFAULT NULL,
  `italian` longtext DEFAULT NULL,
  `thai` longtext DEFAULT NULL,
  `urdu` longtext DEFAULT NULL,
  `hindi` longtext DEFAULT NULL,
  `latin` longtext DEFAULT NULL,
  `indonesian` longtext DEFAULT NULL,
  `japanese` longtext DEFAULT NULL,
  `korean` longtext DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `loyalty_points`
--

CREATE TABLE `loyalty_points` (
  `loyalty_id` int(11) NOT NULL,
  `customer_id` int(11) NOT NULL,
  `points_earned` decimal(10,2) NOT NULL DEFAULT 0.00,
  `points_redeemed` decimal(10,2) NOT NULL DEFAULT 0.00,
  `points_balance` decimal(10,2) NOT NULL DEFAULT 0.00,
  `last_updated` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `loyalty_settings`
--

CREATE TABLE `loyalty_settings` (
  `setting_id` int(11) NOT NULL,
  `points_per_ghs` decimal(10,4) NOT NULL DEFAULT 1.0000,
  `ghs_per_point` decimal(10,4) NOT NULL DEFAULT 0.1000,
  `min_redeem_points` decimal(10,2) NOT NULL DEFAULT 100.00,
  `expiry_days` int(11) NOT NULL DEFAULT 365,
  `is_enabled` tinyint(1) NOT NULL DEFAULT 1,
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `loyalty_transactions`
--

CREATE TABLE `loyalty_transactions` (
  `transaction_id` int(11) NOT NULL,
  `customer_id` int(11) NOT NULL,
  `points` int(11) NOT NULL,
  `transaction_type` enum('earned','redeemed','expired','adjusted') DEFAULT 'earned',
  `reference_code` varchar(100) DEFAULT NULL,
  `description` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `message`
--

CREATE TABLE `message` (
  `message_id` int(11) NOT NULL,
  `message_thread_code` longtext DEFAULT NULL,
  `message` longtext DEFAULT NULL,
  `sender` longtext DEFAULT NULL,
  `timestamp` longtext DEFAULT NULL,
  `read_status` int(11) DEFAULT NULL,
  `attached_file_name` longtext DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `noticeboard`
--

CREATE TABLE `noticeboard` (
  `notice_id` int(11) NOT NULL,
  `notice_title` longtext DEFAULT NULL,
  `notice` longtext DEFAULT NULL,
  `create_timestamp` longtext DEFAULT NULL,
  `created_on` longtext DEFAULT NULL,
  `status` int(11) DEFAULT 1,
  `show_on_website` int(11) DEFAULT 0,
  `image` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `outstanding_debts`
--

CREATE TABLE `outstanding_debts` (
  `debt_id` int(11) NOT NULL,
  `name` longtext NOT NULL,
  `amount` double NOT NULL DEFAULT 0,
  `amount_paid` double NOT NULL DEFAULT 0,
  `amount_due` double NOT NULL DEFAULT 0,
  `description` longtext DEFAULT NULL,
  `timestamp` longtext DEFAULT NULL,
  `date` longtext DEFAULT NULL,
  `payment_timestamp` longtext DEFAULT NULL,
  `account_id` int(11) DEFAULT NULL,
  `alloc_acc_id` int(11) DEFAULT NULL,
  `track_code` longtext DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `packages`
--

CREATE TABLE `packages` (
  `package_id` int(11) NOT NULL,
  `package_name` mediumtext NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;

-- --------------------------------------------------------

--
-- Table structure for table `payment`
--

CREATE TABLE `payment` (
  `payment_id` int(11) NOT NULL,
  `journal_id` int(11) DEFAULT NULL,
  `payment_type` longtext DEFAULT NULL,
  `invoice_id` int(11) DEFAULT NULL,
  `invoice_code` longtext DEFAULT NULL,
  `receipt_code` longtext DEFAULT NULL,
  `po_code` longtext DEFAULT NULL,
  `so_code` longtext DEFAULT NULL,
  `supplier_id` int(11) DEFAULT NULL,
  `customer_id` int(11) DEFAULT NULL,
  `expenditure_item` longtext DEFAULT NULL,
  `method` longtext DEFAULT NULL,
  `description` longtext DEFAULT NULL,
  `amount_tendered` double NOT NULL DEFAULT 0,
  `change_due` double NOT NULL DEFAULT 0,
  `amount` double DEFAULT 0,
  `issuer_id` longtext DEFAULT NULL,
  `account_id` int(11) DEFAULT NULL,
  `bank_name` varchar(255) DEFAULT NULL,
  `branch` varchar(255) DEFAULT NULL,
  `cheque_number` varchar(100) DEFAULT NULL,
  `momo_phone` varchar(20) DEFAULT NULL,
  `momo_transaction_id` varchar(100) DEFAULT NULL,
  `category` longtext DEFAULT NULL,
  `cash_sales_in_payables` double NOT NULL DEFAULT 0,
  `due` double NOT NULL DEFAULT 0,
  `timestamp` longtext DEFAULT NULL,
  `day_timestamp` longtext DEFAULT NULL,
  `date` longtext NOT NULL,
  `track_code` longtext DEFAULT NULL,
  `debt_id` int(11) DEFAULT NULL,
  `momo_type` enum('MTN','Vodafone','AirtelTigo') DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `payment_with_goods`
--

CREATE TABLE `payment_with_goods` (
  `so_id` int(11) NOT NULL,
  `item_id` int(11) NOT NULL,
  `unit_id` int(11) DEFAULT NULL,
  `date_timestamp` longtext DEFAULT NULL,
  `date` longtext NOT NULL,
  `timestamp` longtext DEFAULT NULL,
  `so_code` longtext DEFAULT NULL,
  `waybill_code` mediumtext DEFAULT NULL,
  `customer_id` int(11) DEFAULT NULL,
  `debt_id` int(11) DEFAULT NULL,
  `sales_person_id` int(11) DEFAULT NULL,
  `price` double NOT NULL DEFAULT 0,
  `cost_price` double NOT NULL DEFAULT 0,
  `status` longtext DEFAULT NULL,
  `type_of_sales` longtext DEFAULT NULL,
  `amount` double NOT NULL DEFAULT 0,
  `grand_total` double NOT NULL DEFAULT 0,
  `discount` double DEFAULT 0,
  `amount_paid` double NOT NULL DEFAULT 0,
  `amount_due` double NOT NULL DEFAULT 0,
  `bundle_price` double NOT NULL DEFAULT 0,
  `bundle_quantity` mediumtext DEFAULT NULL,
  `quantity` longtext DEFAULT NULL,
  `total_quantity` longtext DEFAULT NULL,
  `quantity_picked` longtext DEFAULT NULL,
  `quantity_due` longtext DEFAULT NULL,
  `comment` longtext DEFAULT NULL,
  `private_comment` longtext DEFAULT NULL,
  `html_id` longtext DEFAULT NULL,
  `track_code` longtext DEFAULT NULL,
  `item_balance` longtext DEFAULT NULL,
  `negative_or_goods` longtext DEFAULT NULL,
  `opening_entry` int(11) NOT NULL DEFAULT 0,
  `order_item_has_unit_sales` enum('0','1','2') NOT NULL DEFAULT '0',
  `updated_timestamp` mediumtext DEFAULT NULL,
  `picked_by` mediumtext DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `permissions`
--

CREATE TABLE `permissions` (
  `permission_id` int(11) NOT NULL,
  `name` varchar(100) NOT NULL,
  `module` varchar(50) NOT NULL,
  `description` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `prices`
--

CREATE TABLE `prices` (
  `price_id` int(11) NOT NULL,
  `customer_id` int(11) DEFAULT NULL,
  `item1_price` varchar(255) NOT NULL DEFAULT '0',
  `item2_price` varchar(255) NOT NULL DEFAULT '0',
  `item3_price` varchar(255) NOT NULL DEFAULT '0',
  `item4_price` varchar(255) NOT NULL DEFAULT '0',
  `item5_price` varchar(255) NOT NULL DEFAULT '0',
  `item6_price` varchar(255) NOT NULL DEFAULT '0',
  `item7_price` varchar(255) NOT NULL DEFAULT '0',
  `item8_price` varchar(255) NOT NULL DEFAULT '0',
  `item9_price` varchar(255) NOT NULL DEFAULT '0',
  `item10_price` varchar(255) NOT NULL DEFAULT '0',
  `item11_price` varchar(255) NOT NULL DEFAULT '0',
  `item12_price` varchar(255) NOT NULL DEFAULT '0',
  `item13_price` varchar(255) NOT NULL DEFAULT '0',
  `item14_price` varchar(255) NOT NULL DEFAULT '0',
  `item15_price` varchar(255) NOT NULL DEFAULT '0',
  `item16_price` varchar(255) NOT NULL DEFAULT '0',
  `item17_price` varchar(255) NOT NULL DEFAULT '0',
  `item18_price` varchar(255) NOT NULL DEFAULT '0',
  `item19_price` varchar(255) NOT NULL DEFAULT '0',
  `item20_price` varchar(255) NOT NULL DEFAULT '0',
  `item21_price` varchar(255) NOT NULL DEFAULT '0',
  `item22_price` varchar(255) NOT NULL DEFAULT '0',
  `item23_price` varchar(255) NOT NULL DEFAULT '0',
  `item24_price` varchar(255) NOT NULL DEFAULT '0',
  `item25_price` varchar(255) NOT NULL DEFAULT '0',
  `item26_price` varchar(255) NOT NULL DEFAULT '0',
  `item27_price` varchar(255) NOT NULL DEFAULT '0',
  `item28_price` varchar(255) NOT NULL DEFAULT '0',
  `from` longtext DEFAULT NULL,
  `to` longtext DEFAULT NULL,
  `customer_status` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `proforma_invoice`
--

CREATE TABLE `proforma_invoice` (
  `invoice_id` int(11) NOT NULL,
  `invoice_code` longtext DEFAULT NULL,
  `customer_name` longtext NOT NULL,
  `debt_id` int(11) DEFAULT NULL,
  `sales_person_id` int(11) DEFAULT NULL,
  `account_id` int(11) DEFAULT NULL,
  `type_of_payment` longtext DEFAULT NULL,
  `so_code` longtext DEFAULT NULL,
  `description` longtext DEFAULT NULL,
  `amount` double NOT NULL DEFAULT 0,
  `amount_paid` double NOT NULL DEFAULT 0,
  `amount_due` double NOT NULL DEFAULT 0,
  `timestamp` longtext DEFAULT NULL,
  `creation_timestamp` longtext DEFAULT NULL,
  `payment_timestamp` longtext DEFAULT NULL,
  `date` longtext NOT NULL,
  `payment_method` longtext DEFAULT NULL,
  `payment_details` longtext DEFAULT NULL,
  `status` longtext DEFAULT NULL,
  `track_code` longtext DEFAULT NULL,
  `p_prev_paid` double NOT NULL DEFAULT 0,
  `prev_paid` double NOT NULL DEFAULT 0,
  `trash` int(11) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `proforma_invoice_order`
--

CREATE TABLE `proforma_invoice_order` (
  `so_id` int(11) NOT NULL,
  `item_name` longtext NOT NULL,
  `item_description` longtext DEFAULT NULL,
  `date_timestamp` longtext DEFAULT NULL,
  `date` longtext NOT NULL,
  `timestamp` longtext DEFAULT NULL,
  `so_code` longtext DEFAULT NULL,
  `customer_name` longtext NOT NULL,
  `customer_address` longtext DEFAULT NULL,
  `debt_id` int(11) DEFAULT NULL,
  `sales_person_id` int(11) DEFAULT NULL,
  `price` double DEFAULT NULL,
  `status` longtext DEFAULT NULL,
  `type_of_sales` longtext DEFAULT NULL,
  `amount` double NOT NULL DEFAULT 0,
  `grand_total` double NOT NULL DEFAULT 0,
  `amount_paid` double NOT NULL DEFAULT 0,
  `amount_due` double NOT NULL DEFAULT 0,
  `quantity` longtext DEFAULT NULL,
  `total_quantity` longtext DEFAULT NULL,
  `quantity_picked` longtext DEFAULT NULL,
  `quantity_due` longtext DEFAULT NULL,
  `comment` longtext DEFAULT NULL,
  `private_comment` longtext DEFAULT NULL,
  `html_id` longtext DEFAULT NULL,
  `track_code` longtext DEFAULT NULL,
  `item_balance` longtext DEFAULT NULL,
  `negative_or_goods` longtext DEFAULT NULL,
  `opening_entry` int(11) NOT NULL DEFAULT 0,
  `trash` int(11) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `purchase_order`
--

CREATE TABLE `purchase_order` (
  `po_id` int(11) NOT NULL,
  `item_id` int(11) NOT NULL,
  `date_timestamp` longtext NOT NULL,
  `date` longtext NOT NULL,
  `timestamp` longtext DEFAULT NULL,
  `po_code` longtext DEFAULT NULL,
  `supplier_id` int(11) DEFAULT NULL,
  `status` tinytext DEFAULT NULL,
  `type_of_payment` longtext DEFAULT NULL,
  `price` double NOT NULL DEFAULT 0,
  `amount` double NOT NULL DEFAULT 0,
  `grand_total` double NOT NULL DEFAULT 0,
  `amount_paid` double NOT NULL DEFAULT 0,
  `amount_due` double NOT NULL DEFAULT 0,
  `quantity` longtext NOT NULL,
  `comment` longtext DEFAULT NULL,
  `private_comment` longtext DEFAULT NULL,
  `html_id` longtext DEFAULT NULL,
  `track_code` longtext DEFAULT NULL,
  `item_balance` longtext DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `refund_transactions`
--

CREATE TABLE `refund_transactions` (
  `refund_id` int(11) NOT NULL,
  `return_id` int(11) NOT NULL,
  `refund_code` varchar(50) NOT NULL,
  `refund_amount` decimal(12,2) NOT NULL DEFAULT 0.00,
  `refund_method` enum('Cash','Bank Transfer','Credit Note','Store Credit') NOT NULL,
  `refund_account_id` int(11) DEFAULT NULL,
  `refund_status` enum('Pending','Processing','Completed','Failed') DEFAULT 'Pending',
  `transaction_reference` varchar(100) DEFAULT NULL,
  `processed_by` int(11) DEFAULT NULL,
  `processed_timestamp` int(11) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_timestamp` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `returns_audit_trail`
--

CREATE TABLE `returns_audit_trail` (
  `audit_id` int(11) NOT NULL,
  `return_id` int(11) NOT NULL,
  `action_type` enum('Created','Updated','Approved','Rejected','Processed','Completed','Cancelled') NOT NULL,
  `previous_status` varchar(20) DEFAULT NULL,
  `new_status` varchar(20) DEFAULT NULL,
  `action_description` text DEFAULT NULL,
  `performed_by` int(11) NOT NULL,
  `performed_timestamp` int(11) NOT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `user_agent` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `return_reasons`
--

CREATE TABLE `return_reasons` (
  `reason_id` int(11) NOT NULL,
  `reason_name` varchar(100) NOT NULL,
  `reason_description` text DEFAULT NULL,
  `requires_approval` enum('Yes','No') DEFAULT 'Yes',
  `is_active` enum('Yes','No') DEFAULT 'Yes',
  `sort_order` int(11) DEFAULT 0,
  `created_timestamp` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `roles`
--

CREATE TABLE `roles` (
  `role_id` int(11) NOT NULL,
  `name` varchar(50) NOT NULL,
  `level` tinyint(4) NOT NULL,
  `description` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `role_permissions`
--

CREATE TABLE `role_permissions` (
  `role_id` int(11) NOT NULL,
  `permission_id` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `sales_order`
--

CREATE TABLE `sales_order` (
  `so_id` int(11) NOT NULL,
  `item_id` int(11) NOT NULL,
  `unit_id` int(11) DEFAULT NULL,
  `date_timestamp` longtext DEFAULT NULL,
  `date` longtext NOT NULL,
  `timestamp` longtext DEFAULT NULL,
  `so_code` longtext DEFAULT NULL,
  `waybill_code` mediumtext DEFAULT NULL,
  `customer_id` int(11) DEFAULT NULL,
  `debt_id` int(11) DEFAULT NULL,
  `sales_person_id` int(11) DEFAULT NULL,
  `price` double NOT NULL DEFAULT 0,
  `cost_price` double NOT NULL DEFAULT 0,
  `status` longtext DEFAULT NULL,
  `type_of_sales` longtext DEFAULT NULL,
  `amount` double NOT NULL DEFAULT 0,
  `grand_total` double NOT NULL DEFAULT 0,
  `discount` double DEFAULT 0,
  `amount_paid` double NOT NULL DEFAULT 0,
  `amount_due` double NOT NULL DEFAULT 0,
  `bundle_price` double NOT NULL DEFAULT 0,
  `bundle_quantity` mediumtext DEFAULT NULL,
  `quantity` longtext DEFAULT NULL,
  `total_quantity` longtext DEFAULT NULL,
  `quantity_picked` longtext DEFAULT NULL,
  `quantity_due` longtext DEFAULT NULL,
  `comment` longtext DEFAULT NULL,
  `private_comment` longtext DEFAULT NULL,
  `html_id` longtext DEFAULT NULL,
  `track_code` longtext DEFAULT NULL,
  `item_balance` longtext DEFAULT NULL,
  `negative_or_goods` longtext DEFAULT NULL,
  `opening_entry` int(11) NOT NULL DEFAULT 0,
  `order_item_has_unit_sales` enum('0','1','2') NOT NULL DEFAULT '0',
  `updated_timestamp` mediumtext DEFAULT NULL,
  `picked_by` mediumtext DEFAULT NULL,
  `vat_amount` decimal(15,2) NOT NULL DEFAULT 0.00,
  `nhil_amount` decimal(15,2) NOT NULL DEFAULT 0.00,
  `getfund_amount` decimal(15,2) NOT NULL DEFAULT 0.00,
  `covid_amount` decimal(15,2) NOT NULL DEFAULT 0.00,
  `tax_total` decimal(15,2) NOT NULL DEFAULT 0.00,
  `tax_enabled` tinyint(1) NOT NULL DEFAULT 1,
  `tax_inclusive` tinyint(1) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `sales_returns`
--

CREATE TABLE `sales_returns` (
  `return_id` int(11) NOT NULL,
  `return_code` varchar(50) NOT NULL,
  `original_so_code` varchar(50) NOT NULL,
  `original_invoice_code` varchar(50) DEFAULT NULL,
  `customer_id` int(11) NOT NULL,
  `return_date` date NOT NULL,
  `return_timestamp` int(11) NOT NULL,
  `return_reason_id` int(11) NOT NULL,
  `return_reason_description` text DEFAULT NULL,
  `return_status` enum('Pending','Approved','Rejected','Processed','Completed') DEFAULT 'Pending',
  `total_items_returned` int(11) DEFAULT 0,
  `total_refund_amount` decimal(12,2) DEFAULT 0.00,
  `refund_method` enum('Cash','Bank Transfer','Credit Note','Store Credit') DEFAULT NULL,
  `refund_account_id` int(11) DEFAULT NULL,
  `approved_by` int(11) DEFAULT NULL,
  `approved_timestamp` int(11) DEFAULT NULL,
  `processed_by` int(11) DEFAULT NULL,
  `processed_timestamp` int(11) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `internal_notes` text DEFAULT NULL,
  `track_code` varchar(50) DEFAULT NULL,
  `created_by` int(11) NOT NULL,
  `created_timestamp` int(11) NOT NULL,
  `updated_by` int(11) DEFAULT NULL,
  `updated_timestamp` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `sales_return_items`
--

CREATE TABLE `sales_return_items` (
  `return_item_id` int(11) NOT NULL,
  `return_id` int(11) NOT NULL,
  `original_so_item_id` int(11) DEFAULT NULL,
  `item_id` int(11) NOT NULL,
  `quantity_returned` decimal(10,2) NOT NULL DEFAULT 0.00,
  `unit_price` decimal(12,2) NOT NULL DEFAULT 0.00,
  `total_amount` decimal(12,2) NOT NULL DEFAULT 0.00,
  `return_condition` enum('New','Like New','Good','Fair','Damaged') DEFAULT 'Good',
  `restock_status` enum('Yes','No','Damaged') DEFAULT 'Yes',
  `restock_location_id` int(11) DEFAULT NULL,
  `restock_timestamp` int(11) DEFAULT NULL,
  `notes` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `sales_targets`
--

CREATE TABLE `sales_targets` (
  `target_id` int(11) NOT NULL,
  `target_period` enum('daily','weekly','monthly','quarterly','yearly') NOT NULL,
  `target_date` date NOT NULL,
  `revenue_target` decimal(15,2) DEFAULT 0.00,
  `orders_target` int(11) DEFAULT 0,
  `items_target` int(11) DEFAULT 0,
  `created_by` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `settings`
--

CREATE TABLE `settings` (
  `settings_id` int(11) NOT NULL,
  `type` longtext DEFAULT NULL,
  `description` longtext DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `shelves`
--

CREATE TABLE `shelves` (
  `shelf_id` int(11) NOT NULL,
  `shop_id` int(11) NOT NULL,
  `shelf_code` varchar(50) NOT NULL,
  `shelf_name` varchar(255) NOT NULL,
  `total_rows` int(11) NOT NULL DEFAULT 1,
  `total_columns` int(11) NOT NULL DEFAULT 1,
  `description` text DEFAULT NULL,
  `status` enum('active','inactive') DEFAULT 'active',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `shops`
--

CREATE TABLE `shops` (
  `shop_id` int(11) NOT NULL,
  `shop_code` varchar(50) NOT NULL,
  `shop_name` varchar(255) NOT NULL,
  `location` varchar(255) DEFAULT NULL,
  `description` text DEFAULT NULL,
  `status` enum('active','inactive') DEFAULT 'active',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `shop_attendants`
--

CREATE TABLE `shop_attendants` (
  `attendant_id` int(11) NOT NULL,
  `shop_id` int(11) NOT NULL,
  `admin_id` int(11) NOT NULL,
  `assigned_date` date NOT NULL,
  `status` enum('active','inactive') DEFAULT 'active',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `stock_manager`
--

CREATE TABLE `stock_manager` (
  `stock_id` int(11) NOT NULL,
  `item_id` int(11) NOT NULL,
  `cost_price` double NOT NULL DEFAULT 0,
  `selling_price` double NOT NULL DEFAULT 0,
  `user_id` int(11) NOT NULL,
  `opening_timestamp` int(20) DEFAULT NULL,
  `closing_timestamp` int(20) DEFAULT NULL,
  `date_timestamp` int(20) NOT NULL,
  `opening_stock` double DEFAULT 0,
  `stock_in_today` double NOT NULL DEFAULT 0,
  `closing_stock` double DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `stock_record`
--

CREATE TABLE `stock_record` (
  `record_id` int(11) NOT NULL,
  `item_id` int(11) NOT NULL,
  `supplier_id` int(11) NOT NULL,
  `po_code` mediumtext DEFAULT NULL,
  `so_code` mediumtext DEFAULT NULL,
  `date` mediumtext NOT NULL,
  `q_bought` bigint(20) NOT NULL DEFAULT 0,
  `q_sold` bigint(20) NOT NULL DEFAULT 0,
  `cost_price` double NOT NULL DEFAULT 0,
  `selling_price` double NOT NULL DEFAULT 0,
  `item_balance` bigint(20) NOT NULL DEFAULT 0,
  `timestamp` mediumtext NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;

-- --------------------------------------------------------

--
-- Table structure for table `store_credits`
--

CREATE TABLE `store_credits` (
  `credit_id` int(11) NOT NULL,
  `customer_id` int(11) NOT NULL,
  `return_id` int(11) DEFAULT NULL,
  `credit_code` varchar(50) NOT NULL,
  `credit_amount` decimal(12,2) NOT NULL DEFAULT 0.00,
  `balance_amount` decimal(12,2) NOT NULL DEFAULT 0.00,
  `credit_status` enum('Active','Used','Expired','Void') DEFAULT 'Active',
  `expiry_date` date DEFAULT NULL,
  `issued_timestamp` int(11) NOT NULL,
  `issued_by` int(11) NOT NULL,
  `notes` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `suppliers`
--

CREATE TABLE `suppliers` (
  `supplier_id` int(11) NOT NULL,
  `supplier_name` longtext NOT NULL,
  `contact_person` longtext NOT NULL,
  `address` longtext NOT NULL,
  `mobile` tinytext NOT NULL,
  `phone` tinytext NOT NULL,
  `email` tinytext NOT NULL,
  `opening_balance` double DEFAULT 0,
  `balance_due` double DEFAULT 0,
  `date` longtext DEFAULT NULL,
  `timestamp` longtext DEFAULT NULL,
  `opening_accounts_payable_id` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `units`
--

CREATE TABLE `units` (
  `unit_id` int(11) NOT NULL,
  `unit_name` text NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;

-- --------------------------------------------------------

--
-- Table structure for table `units_items`
--

CREATE TABLE `units_items` (
  `id` int(11) NOT NULL,
  `unit_id` int(11) NOT NULL,
  `item_id` int(11) NOT NULL,
  `unit_total` double NOT NULL DEFAULT 0,
  `unit_price` double NOT NULL DEFAULT 0,
  `timestamp` longtext DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;

-- --------------------------------------------------------

--
-- Table structure for table `unit_transfer`
--

CREATE TABLE `unit_transfer` (
  `transfer_id` int(11) NOT NULL,
  `unit_id` int(11) NOT NULL,
  `item_id` int(11) NOT NULL,
  `package_quantity` double NOT NULL DEFAULT 0,
  `unit_quantity` double NOT NULL DEFAULT 0,
  `package_quantity_balance` double NOT NULL DEFAULT 0,
  `unit_quantity_balance` double NOT NULL DEFAULT 0,
  `transfer_date` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;

-- --------------------------------------------------------

--
-- Table structure for table `visitor_tracker`
--

CREATE TABLE `visitor_tracker` (
  `id` int(11) NOT NULL,
  `ip` varchar(15) NOT NULL,
  `page_view` text DEFAULT NULL,
  `date` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

-- --------------------------------------------------------

--
-- Table structure for table `waybill_code`
--

CREATE TABLE `waybill_code` (
  `id` int(11) NOT NULL,
  `code` mediumtext NOT NULL,
  `created_date` datetime NOT NULL DEFAULT current_timestamp(),
  `modified_date` datetime DEFAULT NULL,
  `created_by` int(11) NOT NULL,
  `modified_by` int(11) DEFAULT NULL,
  `status` enum('open','closed','not used') NOT NULL DEFAULT 'open',
  `reason_not_used` longtext DEFAULT NULL,
  `code_range` text NOT NULL,
  `customer_id` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;

--
-- Indexes for dumped tables
--

--
-- Indexes for table `accounts`
--
ALTER TABLE `accounts`
  ADD PRIMARY KEY (`account_id`),
  ADD KEY `idx_accounts_type` (`account_type`),
  ADD KEY `idx_accounts_is_bank` (`account_is_bank`),
  ADD KEY `idx_accounts_name` (`name`(50));

--
-- Indexes for table `accounts_payable`
--
ALTER TABLE `accounts_payable`
  ADD PRIMARY KEY (`accounts_payable_id`),
  ADD KEY `idx_ap_supplier` (`supplier_id`),
  ADD KEY `idx_ap_account` (`account_id`),
  ADD KEY `idx_ap_po_code` (`po_code`(50)),
  ADD KEY `idx_ap_date` (`date`(20)),
  ADD KEY `idx_ap_po` (`po_code`(50)),
  ADD KEY `idx_ap_status` (`status`(20));

--
-- Indexes for table `accounts_used`
--
ALTER TABLE `accounts_used`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_au_account` (`account_id`),
  ADD KEY `idx_au_customer` (`customer_id`),
  ADD KEY `idx_au_receipt` (`receipt_code`(50)),
  ADD KEY `idx_au_date` (`date_timestamp`(20));

--
-- Indexes for table `account_type`
--
ALTER TABLE `account_type`
  ADD PRIMARY KEY (`account_type_id`);

--
-- Indexes for table `admin`
--
ALTER TABLE `admin`
  ADD PRIMARY KEY (`admin_id`),
  ADD KEY `idx_admin_email` (`email`(100)),
  ADD KEY `idx_admin_active` (`active_status`);

--
-- Indexes for table `attendance`
--
ALTER TABLE `attendance`
  ADD PRIMARY KEY (`attendance_id`),
  ADD KEY `idx_attendance_user_date` (`user_id`,`date_timestamp`);

--
-- Indexes for table `audit_log`
--
ALTER TABLE `audit_log`
  ADD PRIMARY KEY (`log_id`),
  ADD KEY `idx_audit_admin_id` (`admin_id`),
  ADD KEY `idx_audit_created_at` (`created_at`);

--
-- Indexes for table `balance_sheet`
--
ALTER TABLE `balance_sheet`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `cash_deposit_disbursement`
--
ALTER TABLE `cash_deposit_disbursement`
  ADD PRIMARY KEY (`deposit_id`);

--
-- Indexes for table `creditors`
--
ALTER TABLE `creditors`
  ADD PRIMARY KEY (`creditor_id`),
  ADD KEY `idx_creditors_timestamp` (`timestamp`(20)),
  ADD KEY `idx_creditors_type` (`creditor_type_id`);

--
-- Indexes for table `customers`
--
ALTER TABLE `customers`
  ADD PRIMARY KEY (`customer_id`),
  ADD KEY `idx_customers_name` (`customer_name`(50)),
  ADD KEY `idx_customers_email` (`email`(100)),
  ADD KEY `idx_customers_mobile` (`mobile`(20)),
  ADD KEY `idx_customers_active` (`customer_active`),
  ADD KEY `idx_customers_balance` (`balance_due`);

--
-- Indexes for table `customer_loyalty`
--
ALTER TABLE `customer_loyalty`
  ADD PRIMARY KEY (`loyalty_id`),
  ADD UNIQUE KEY `customer_id` (`customer_id`),
  ADD KEY `tier_id` (`tier_id`);

--
-- Indexes for table `customer_rewards`
--
ALTER TABLE `customer_rewards`
  ADD PRIMARY KEY (`reward_id`),
  ADD UNIQUE KEY `reward_code` (`reward_code`),
  ADD KEY `customer_id` (`customer_id`);

--
-- Indexes for table `customer_segments`
--
ALTER TABLE `customer_segments`
  ADD PRIMARY KEY (`segment_id`);

--
-- Indexes for table `customer_tiers`
--
ALTER TABLE `customer_tiers`
  ADD PRIMARY KEY (`tier_id`);

--
-- Indexes for table `debtors`
--
ALTER TABLE `debtors`
  ADD PRIMARY KEY (`debtor_id`),
  ADD KEY `idx_debtors_timestamp` (`timestamp`(20)),
  ADD KEY `idx_debtors_type` (`debtor_type_id`);

--
-- Indexes for table `general_journal`
--
ALTER TABLE `general_journal`
  ADD PRIMARY KEY (`journal_id`),
  ADD KEY `idx_gj_customer` (`customer_id`),
  ADD KEY `idx_gj_supplier` (`supplier_id`),
  ADD KEY `idx_gj_account` (`account_name`(100)),
  ADD KEY `idx_gj_invoice` (`invoice_code`(50)),
  ADD KEY `idx_gj_so_code` (`so_code`(50)),
  ADD KEY `idx_gj_debit` (`debit_amount`),
  ADD KEY `idx_gj_credit` (`credit_amount`),
  ADD KEY `idx_gj_timestamp` (`timestamp`(20)),
  ADD KEY `idx_gj_name_timestamp` (`account_name`(100),`timestamp`(20)),
  ADD KEY `idx_gj_so` (`so_code`(50));

--
-- Indexes for table `invoice`
--
ALTER TABLE `invoice`
  ADD PRIMARY KEY (`invoice_id`),
  ADD KEY `idx_invoice_customer` (`customer_id`),
  ADD KEY `idx_invoice_code` (`invoice_code`(50)),
  ADD KEY `idx_invoice_so_code` (`so_code`(50)),
  ADD KEY `idx_invoice_date` (`date`(20)),
  ADD KEY `idx_invoice_status` (`status`(20)),
  ADD KEY `idx_invoice_amount` (`amount`),
  ADD KEY `idx_invoice_so` (`so_code`(50));

--
-- Indexes for table `invoice_code`
--
ALTER TABLE `invoice_code`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_ic_status` (`status`),
  ADD KEY `idx_ic_customer` (`customer_id`);

--
-- Indexes for table `items`
--
ALTER TABLE `items`
  ADD PRIMARY KEY (`item_id`),
  ADD KEY `idx_item_shop` (`shop_id`),
  ADD KEY `idx_items_name` (`item_name`(50)),
  ADD KEY `idx_items_category` (`category_id`),
  ADD KEY `idx_items_supplier` (`supplier_id`),
  ADD KEY `idx_items_shop` (`shop_id`),
  ADD KEY `idx_items_quantity` (`quantity`);

--
-- Indexes for table `items_in_units_order`
--
ALTER TABLE `items_in_units_order`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_iuo_item` (`item_id`),
  ADD KEY `idx_iuo_customer` (`customer_id`),
  ADD KEY `idx_iuo_unit` (`unit_id`);

--
-- Indexes for table `items_prices`
--
ALTER TABLE `items_prices`
  ADD PRIMARY KEY (`prices_id`),
  ADD UNIQUE KEY `item_customer_ids` (`item_id`,`customer_id`) USING BTREE,
  ADD KEY `Customer ID Constraint` (`customer_id`);

--
-- Indexes for table `items_transfers`
--
ALTER TABLE `items_transfers`
  ADD PRIMARY KEY (`t_id`),
  ADD KEY `idx_transfer_item` (`item_id`),
  ADD KEY `idx_transfer_sales_person` (`sales_person_id`),
  ADD KEY `idx_transfer_receiver` (`receiver`(100)),
  ADD KEY `idx_transfer_date` (`date`(20)),
  ADD KEY `idx_transfers_item` (`item_id`),
  ADD KEY `idx_transfers_date` (`date`(20)),
  ADD KEY `idx_transfers_sales_person` (`sales_person_id`);

--
-- Indexes for table `items_units_prices`
--
ALTER TABLE `items_units_prices`
  ADD PRIMARY KEY (`prices_id`),
  ADD UNIQUE KEY `item_customer_ids` (`item_id`,`customer_id`) USING BTREE,
  ADD KEY `Customer ID Constraint` (`customer_id`),
  ADD KEY `idx_prices_unit` (`unit_id`),
  ADD KEY `idx_prices_item` (`item_id`),
  ADD KEY `idx_prices_customer` (`customer_id`);

--
-- Indexes for table `item_category`
--
ALTER TABLE `item_category`
  ADD PRIMARY KEY (`category_id`),
  ADD KEY `idx_category_main` (`main_id`);

--
-- Indexes for table `item_locations`
--
ALTER TABLE `item_locations`
  ADD PRIMARY KEY (`location_id`),
  ADD UNIQUE KEY `unique_item_location` (`item_id`,`shop_id`,`shelf_id`,`row_number`,`column_number`),
  ADD KEY `idx_item_id` (`item_id`),
  ADD KEY `idx_shop_id` (`shop_id`),
  ADD KEY `idx_shelf_id` (`shelf_id`);

--
-- Indexes for table `item_main_category`
--
ALTER TABLE `item_main_category`
  ADD PRIMARY KEY (`category_id`);

--
-- Indexes for table `kpi_snapshots`
--
ALTER TABLE `kpi_snapshots`
  ADD PRIMARY KEY (`snapshot_id`),
  ADD UNIQUE KEY `snapshot_date` (`snapshot_date`);

--
-- Indexes for table `language`
--
ALTER TABLE `language`
  ADD PRIMARY KEY (`phrase_id`);

--
-- Indexes for table `loyalty_points`
--
ALTER TABLE `loyalty_points`
  ADD PRIMARY KEY (`loyalty_id`),
  ADD KEY `idx_loyalty_customer` (`customer_id`);

--
-- Indexes for table `loyalty_settings`
--
ALTER TABLE `loyalty_settings`
  ADD PRIMARY KEY (`setting_id`);

--
-- Indexes for table `loyalty_transactions`
--
ALTER TABLE `loyalty_transactions`
  ADD PRIMARY KEY (`transaction_id`),
  ADD KEY `customer_id` (`customer_id`);

--
-- Indexes for table `message`
--
ALTER TABLE `message`
  ADD PRIMARY KEY (`message_id`);

--
-- Indexes for table `noticeboard`
--
ALTER TABLE `noticeboard`
  ADD PRIMARY KEY (`notice_id`);

--
-- Indexes for table `outstanding_debts`
--
ALTER TABLE `outstanding_debts`
  ADD PRIMARY KEY (`debt_id`),
  ADD KEY `idx_debt_account` (`account_id`),
  ADD KEY `idx_debt_amount` (`amount_due`);

--
-- Indexes for table `packages`
--
ALTER TABLE `packages`
  ADD PRIMARY KEY (`package_id`);

--
-- Indexes for table `payment`
--
ALTER TABLE `payment`
  ADD PRIMARY KEY (`payment_id`),
  ADD KEY `idx_payment_customer` (`customer_id`),
  ADD KEY `idx_payment_supplier` (`supplier_id`),
  ADD KEY `idx_payment_invoice` (`invoice_id`),
  ADD KEY `idx_payment_journal` (`journal_id`),
  ADD KEY `idx_payment_account` (`account_id`),
  ADD KEY `idx_payment_method` (`method`(50)),
  ADD KEY `idx_payment_date` (`date`(20)),
  ADD KEY `idx_payment_amount` (`amount`);

--
-- Indexes for table `payment_with_goods`
--
ALTER TABLE `payment_with_goods`
  ADD PRIMARY KEY (`so_id`),
  ADD KEY `idx_pwg_customer` (`customer_id`),
  ADD KEY `idx_pwg_item` (`item_id`),
  ADD KEY `idx_pwg_debt` (`debt_id`),
  ADD KEY `idx_pwg_sales_person` (`sales_person_id`),
  ADD KEY `idx_pwg_so_code` (`so_code`(50)),
  ADD KEY `idx_pwg_date` (`date`(20)),
  ADD KEY `idx_pwg_customer_date` (`customer_id`,`date_timestamp`(20)),
  ADD KEY `idx_pwg_item_date` (`item_id`,`date_timestamp`(20));

--
-- Indexes for table `permissions`
--
ALTER TABLE `permissions`
  ADD PRIMARY KEY (`permission_id`),
  ADD UNIQUE KEY `uq_permissions_name` (`name`);

--
-- Indexes for table `prices`
--
ALTER TABLE `prices`
  ADD PRIMARY KEY (`price_id`);

--
-- Indexes for table `proforma_invoice`
--
ALTER TABLE `proforma_invoice`
  ADD PRIMARY KEY (`invoice_id`),
  ADD KEY `idx_pi_so_code` (`so_code`(50)),
  ADD KEY `idx_pi_date` (`date`(20)),
  ADD KEY `idx_pi_status` (`status`(20));

--
-- Indexes for table `proforma_invoice_order`
--
ALTER TABLE `proforma_invoice_order`
  ADD PRIMARY KEY (`so_id`),
  ADD KEY `idx_pio_so_code` (`so_code`(50)),
  ADD KEY `idx_pio_date` (`date`(20));

--
-- Indexes for table `purchase_order`
--
ALTER TABLE `purchase_order`
  ADD PRIMARY KEY (`po_id`),
  ADD KEY `idx_po_item` (`item_id`),
  ADD KEY `idx_po_supplier` (`supplier_id`),
  ADD KEY `idx_po_code` (`po_code`(50)),
  ADD KEY `idx_po_date` (`date`(20)),
  ADD KEY `idx_po_item_date_ts` (`item_id`,`date_timestamp`(20)),
  ADD KEY `idx_po_status` (`status`(20));

--
-- Indexes for table `refund_transactions`
--
ALTER TABLE `refund_transactions`
  ADD PRIMARY KEY (`refund_id`),
  ADD UNIQUE KEY `refund_code` (`refund_code`),
  ADD KEY `idx_return_id` (`return_id`),
  ADD KEY `idx_refund_code` (`refund_code`),
  ADD KEY `idx_refund_status` (`refund_status`),
  ADD KEY `idx_processed_timestamp` (`processed_timestamp`);

--
-- Indexes for table `returns_audit_trail`
--
ALTER TABLE `returns_audit_trail`
  ADD PRIMARY KEY (`audit_id`),
  ADD KEY `idx_return_id` (`return_id`),
  ADD KEY `idx_action_type` (`action_type`),
  ADD KEY `idx_performed_timestamp` (`performed_timestamp`),
  ADD KEY `idx_audit_composite` (`return_id`,`performed_timestamp`,`action_type`);

--
-- Indexes for table `return_reasons`
--
ALTER TABLE `return_reasons`
  ADD PRIMARY KEY (`reason_id`),
  ADD KEY `idx_reason_name` (`reason_name`),
  ADD KEY `idx_is_active` (`is_active`);

--
-- Indexes for table `roles`
--
ALTER TABLE `roles`
  ADD PRIMARY KEY (`role_id`),
  ADD UNIQUE KEY `uq_roles_name` (`name`);

--
-- Indexes for table `role_permissions`
--
ALTER TABLE `role_permissions`
  ADD PRIMARY KEY (`role_id`,`permission_id`),
  ADD KEY `fk_rp_permission_idx` (`permission_id`);

--
-- Indexes for table `sales_order`
--
ALTER TABLE `sales_order`
  ADD PRIMARY KEY (`so_id`),
  ADD KEY `idx_so_customer` (`customer_id`),
  ADD KEY `idx_so_item` (`item_id`),
  ADD KEY `idx_so_sales_person` (`sales_person_id`),
  ADD KEY `idx_so_code` (`so_code`(50)),
  ADD KEY `idx_so_date` (`date`(20)),
  ADD KEY `idx_so_status` (`status`(20)),
  ADD KEY `idx_so_customer_date` (`customer_id`,`date`(20)),
  ADD KEY `idx_so_item_date_ts` (`item_id`,`date_timestamp`(20));

--
-- Indexes for table `sales_returns`
--
ALTER TABLE `sales_returns`
  ADD PRIMARY KEY (`return_id`),
  ADD UNIQUE KEY `return_code` (`return_code`),
  ADD KEY `idx_return_code` (`return_code`),
  ADD KEY `idx_original_so_code` (`original_so_code`),
  ADD KEY `idx_customer_id` (`customer_id`),
  ADD KEY `idx_return_date` (`return_date`),
  ADD KEY `idx_return_status` (`return_status`),
  ADD KEY `idx_created_timestamp` (`created_timestamp`),
  ADD KEY `idx_returns_composite` (`customer_id`,`return_status`,`return_date`);

--
-- Indexes for table `sales_return_items`
--
ALTER TABLE `sales_return_items`
  ADD PRIMARY KEY (`return_item_id`),
  ADD KEY `idx_return_id` (`return_id`),
  ADD KEY `idx_item_id` (`item_id`),
  ADD KEY `idx_return_items_composite` (`return_id`,`item_id`,`restock_status`);

--
-- Indexes for table `sales_targets`
--
ALTER TABLE `sales_targets`
  ADD PRIMARY KEY (`target_id`),
  ADD KEY `created_by` (`created_by`);

--
-- Indexes for table `settings`
--
ALTER TABLE `settings`
  ADD PRIMARY KEY (`settings_id`);

--
-- Indexes for table `shelves`
--
ALTER TABLE `shelves`
  ADD PRIMARY KEY (`shelf_id`),
  ADD UNIQUE KEY `unique_shelf_shop` (`shop_id`,`shelf_code`),
  ADD KEY `idx_shop_id` (`shop_id`),
  ADD KEY `idx_shelf_code` (`shelf_code`);

--
-- Indexes for table `shops`
--
ALTER TABLE `shops`
  ADD PRIMARY KEY (`shop_id`),
  ADD UNIQUE KEY `shop_code` (`shop_code`),
  ADD KEY `idx_shop_code` (`shop_code`),
  ADD KEY `idx_status` (`status`);

--
-- Indexes for table `shop_attendants`
--
ALTER TABLE `shop_attendants`
  ADD PRIMARY KEY (`attendant_id`),
  ADD UNIQUE KEY `unique_shop_admin` (`shop_id`,`admin_id`),
  ADD KEY `idx_shop_id` (`shop_id`),
  ADD KEY `idx_admin_id` (`admin_id`);

--
-- Indexes for table `stock_manager`
--
ALTER TABLE `stock_manager`
  ADD PRIMARY KEY (`stock_id`),
  ADD KEY `idx_stock_manager_user_date` (`user_id`,`date_timestamp`),
  ADD KEY `idx_stock_manager_closing` (`closing_timestamp`),
  ADD KEY `idx_stock_item` (`item_id`),
  ADD KEY `idx_stock_user` (`user_id`),
  ADD KEY `idx_stock_date` (`date_timestamp`);

--
-- Indexes for table `stock_record`
--
ALTER TABLE `stock_record`
  ADD PRIMARY KEY (`record_id`),
  ADD KEY `idx_sr_item` (`item_id`),
  ADD KEY `idx_sr_supplier` (`supplier_id`),
  ADD KEY `idx_sr_date` (`date`(20));

--
-- Indexes for table `store_credits`
--
ALTER TABLE `store_credits`
  ADD PRIMARY KEY (`credit_id`),
  ADD UNIQUE KEY `credit_code` (`credit_code`),
  ADD KEY `idx_customer_id` (`customer_id`),
  ADD KEY `idx_credit_code` (`credit_code`),
  ADD KEY `idx_credit_status` (`credit_status`),
  ADD KEY `idx_expiry_date` (`expiry_date`);

--
-- Indexes for table `suppliers`
--
ALTER TABLE `suppliers`
  ADD PRIMARY KEY (`supplier_id`),
  ADD KEY `idx_suppliers_name` (`supplier_name`(50)),
  ADD KEY `idx_suppliers_email` (`email`(100)),
  ADD KEY `idx_suppliers_mobile` (`mobile`(20)),
  ADD KEY `idx_suppliers_balance` (`balance_due`);

--
-- Indexes for table `units`
--
ALTER TABLE `units`
  ADD PRIMARY KEY (`unit_id`);

--
-- Indexes for table `units_items`
--
ALTER TABLE `units_items`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `unit_transfer`
--
ALTER TABLE `unit_transfer`
  ADD PRIMARY KEY (`transfer_id`);

--
-- Indexes for table `visitor_tracker`
--
ALTER TABLE `visitor_tracker`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `waybill_code`
--
ALTER TABLE `waybill_code`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_wc_status` (`status`),
  ADD KEY `idx_wc_customer` (`customer_id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `accounts`
--
ALTER TABLE `accounts`
  MODIFY `account_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `accounts_payable`
--
ALTER TABLE `accounts_payable`
  MODIFY `accounts_payable_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `accounts_used`
--
ALTER TABLE `accounts_used`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `account_type`
--
ALTER TABLE `account_type`
  MODIFY `account_type_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `admin`
--
ALTER TABLE `admin`
  MODIFY `admin_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `attendance`
--
ALTER TABLE `attendance`
  MODIFY `attendance_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `audit_log`
--
ALTER TABLE `audit_log`
  MODIFY `log_id` bigint(20) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `balance_sheet`
--
ALTER TABLE `balance_sheet`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `cash_deposit_disbursement`
--
ALTER TABLE `cash_deposit_disbursement`
  MODIFY `deposit_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `creditors`
--
ALTER TABLE `creditors`
  MODIFY `creditor_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `customers`
--
ALTER TABLE `customers`
  MODIFY `customer_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `customer_loyalty`
--
ALTER TABLE `customer_loyalty`
  MODIFY `loyalty_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `customer_rewards`
--
ALTER TABLE `customer_rewards`
  MODIFY `reward_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `customer_segments`
--
ALTER TABLE `customer_segments`
  MODIFY `segment_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `customer_tiers`
--
ALTER TABLE `customer_tiers`
  MODIFY `tier_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `debtors`
--
ALTER TABLE `debtors`
  MODIFY `debtor_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `general_journal`
--
ALTER TABLE `general_journal`
  MODIFY `journal_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `invoice`
--
ALTER TABLE `invoice`
  MODIFY `invoice_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `invoice_code`
--
ALTER TABLE `invoice_code`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `items`
--
ALTER TABLE `items`
  MODIFY `item_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `items_in_units_order`
--
ALTER TABLE `items_in_units_order`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `items_prices`
--
ALTER TABLE `items_prices`
  MODIFY `prices_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `items_transfers`
--
ALTER TABLE `items_transfers`
  MODIFY `t_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `items_units_prices`
--
ALTER TABLE `items_units_prices`
  MODIFY `prices_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `item_category`
--
ALTER TABLE `item_category`
  MODIFY `category_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `item_locations`
--
ALTER TABLE `item_locations`
  MODIFY `location_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `item_main_category`
--
ALTER TABLE `item_main_category`
  MODIFY `category_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `kpi_snapshots`
--
ALTER TABLE `kpi_snapshots`
  MODIFY `snapshot_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `language`
--
ALTER TABLE `language`
  MODIFY `phrase_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `loyalty_points`
--
ALTER TABLE `loyalty_points`
  MODIFY `loyalty_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `loyalty_settings`
--
ALTER TABLE `loyalty_settings`
  MODIFY `setting_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `loyalty_transactions`
--
ALTER TABLE `loyalty_transactions`
  MODIFY `transaction_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `message`
--
ALTER TABLE `message`
  MODIFY `message_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `noticeboard`
--
ALTER TABLE `noticeboard`
  MODIFY `notice_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `outstanding_debts`
--
ALTER TABLE `outstanding_debts`
  MODIFY `debt_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `packages`
--
ALTER TABLE `packages`
  MODIFY `package_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `payment`
--
ALTER TABLE `payment`
  MODIFY `payment_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `payment_with_goods`
--
ALTER TABLE `payment_with_goods`
  MODIFY `so_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `permissions`
--
ALTER TABLE `permissions`
  MODIFY `permission_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `prices`
--
ALTER TABLE `prices`
  MODIFY `price_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `proforma_invoice`
--
ALTER TABLE `proforma_invoice`
  MODIFY `invoice_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `proforma_invoice_order`
--
ALTER TABLE `proforma_invoice_order`
  MODIFY `so_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `purchase_order`
--
ALTER TABLE `purchase_order`
  MODIFY `po_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `refund_transactions`
--
ALTER TABLE `refund_transactions`
  MODIFY `refund_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `returns_audit_trail`
--
ALTER TABLE `returns_audit_trail`
  MODIFY `audit_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `return_reasons`
--
ALTER TABLE `return_reasons`
  MODIFY `reason_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `roles`
--
ALTER TABLE `roles`
  MODIFY `role_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `sales_order`
--
ALTER TABLE `sales_order`
  MODIFY `so_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `sales_returns`
--
ALTER TABLE `sales_returns`
  MODIFY `return_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `sales_return_items`
--
ALTER TABLE `sales_return_items`
  MODIFY `return_item_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `sales_targets`
--
ALTER TABLE `sales_targets`
  MODIFY `target_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `settings`
--
ALTER TABLE `settings`
  MODIFY `settings_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `shelves`
--
ALTER TABLE `shelves`
  MODIFY `shelf_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `shops`
--
ALTER TABLE `shops`
  MODIFY `shop_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `shop_attendants`
--
ALTER TABLE `shop_attendants`
  MODIFY `attendant_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `stock_manager`
--
ALTER TABLE `stock_manager`
  MODIFY `stock_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `stock_record`
--
ALTER TABLE `stock_record`
  MODIFY `record_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `store_credits`
--
ALTER TABLE `store_credits`
  MODIFY `credit_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `suppliers`
--
ALTER TABLE `suppliers`
  MODIFY `supplier_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `units`
--
ALTER TABLE `units`
  MODIFY `unit_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `units_items`
--
ALTER TABLE `units_items`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `unit_transfer`
--
ALTER TABLE `unit_transfer`
  MODIFY `transfer_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `visitor_tracker`
--
ALTER TABLE `visitor_tracker`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `waybill_code`
--
ALTER TABLE `waybill_code`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `customer_loyalty`
--
ALTER TABLE `customer_loyalty`
  ADD CONSTRAINT `customer_loyalty_ibfk_1` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`customer_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `customer_loyalty_ibfk_2` FOREIGN KEY (`tier_id`) REFERENCES `customer_tiers` (`tier_id`);

--
-- Constraints for table `customer_rewards`
--
ALTER TABLE `customer_rewards`
  ADD CONSTRAINT `customer_rewards_ibfk_1` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`customer_id`) ON DELETE CASCADE;

--
-- Constraints for table `item_locations`
--
ALTER TABLE `item_locations`
  ADD CONSTRAINT `fk_location_shelf` FOREIGN KEY (`shelf_id`) REFERENCES `shelves` (`shelf_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_location_shop` FOREIGN KEY (`shop_id`) REFERENCES `shops` (`shop_id`) ON DELETE CASCADE;

--
-- Constraints for table `loyalty_transactions`
--
ALTER TABLE `loyalty_transactions`
  ADD CONSTRAINT `loyalty_transactions_ibfk_1` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`customer_id`) ON DELETE CASCADE;

--
-- Constraints for table `refund_transactions`
--
ALTER TABLE `refund_transactions`
  ADD CONSTRAINT `fk_refund_return` FOREIGN KEY (`return_id`) REFERENCES `sales_returns` (`return_id`) ON DELETE CASCADE;

--
-- Constraints for table `returns_audit_trail`
--
ALTER TABLE `returns_audit_trail`
  ADD CONSTRAINT `fk_audit_return` FOREIGN KEY (`return_id`) REFERENCES `sales_returns` (`return_id`) ON DELETE CASCADE;

--
-- Constraints for table `role_permissions`
--
ALTER TABLE `role_permissions`
  ADD CONSTRAINT `fk_rp_permission` FOREIGN KEY (`permission_id`) REFERENCES `permissions` (`permission_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_rp_role` FOREIGN KEY (`role_id`) REFERENCES `roles` (`role_id`) ON DELETE CASCADE;

--
-- Constraints for table `sales_return_items`
--
ALTER TABLE `sales_return_items`
  ADD CONSTRAINT `fk_return_item_return` FOREIGN KEY (`return_id`) REFERENCES `sales_returns` (`return_id`) ON DELETE CASCADE;

--
-- Constraints for table `sales_targets`
--
ALTER TABLE `sales_targets`
  ADD CONSTRAINT `sales_targets_ibfk_1` FOREIGN KEY (`created_by`) REFERENCES `admin` (`admin_id`);

--
-- Constraints for table `shelves`
--
ALTER TABLE `shelves`
  ADD CONSTRAINT `fk_shelf_shop` FOREIGN KEY (`shop_id`) REFERENCES `shops` (`shop_id`) ON DELETE CASCADE;

--
-- Constraints for table `shop_attendants`
--
ALTER TABLE `shop_attendants`
  ADD CONSTRAINT `fk_attendant_admin` FOREIGN KEY (`admin_id`) REFERENCES `admin` (`admin_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_attendant_shop` FOREIGN KEY (`shop_id`) REFERENCES `shops` (`shop_id`) ON DELETE CASCADE;

--
-- Constraints for table `store_credits`
--
ALTER TABLE `store_credits`
  ADD CONSTRAINT `fk_credit_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`customer_id`) ON DELETE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
