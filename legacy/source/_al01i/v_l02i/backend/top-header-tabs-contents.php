<!--FOR HOME-->
<?php
//date duration selection
$opening_day =  $this->db->get_where('settings', array('type' => 'opening_day'))->row()->description; 
$from = date('d-m-Y', strtotime('this week '. $opening_day));
$to = date('d-m-Y');

?>

<div class="tab-pane <?php if ($page_name == 'dashboard') {
	echo 'active';
}
?>" id="tab1">
	<nav class="navbar navbar-expand-lg navbar-dark">
	  <button class="navbar-toggler" type="button" data-toggle="collapse" data-target="#navbarSupportedContent" aria-controls="navbarSupportedContent" aria-expanded="false" aria-label="Toggle navigation">
	    <span class="navbar-toggler-icon"></span>
	  </button>

	  <div class="collapse navbar-collapse" id="navbarSupportedContent">
	    <ul class="navbar-nav mr-auto flex gap-3">
	      <li class="nav-item active">
	        <a class="nav-link btn btn-sm btn-outline-info rounded-lg" type="button" href="#" onclick="showAjaxModal_payments_sales('<?php echo site_url('modal/popup_sales/payments/'); ?>', 'Take Payment')">
	        	<span class="visible-xs"><i class="fas fa-fw fa-hand-holding-usd"></i></span>
	        	<span class="hidden-xs"><i class="fas fa-fw fa-hand-holding-usd"></i> Take Payment</span>
	        </a>
	      </li>
	      <li class="nav-item">
	        <a class="nav-link btn btn-sm btn-outline-info rounded-lg" type="button" href="#" onclick="showAjaxModal_payments_sales('<?php echo site_url('modal/popup_purchases/payments/'); ?>', 'Make Payment')">
	        	<span class="visible-xs"><i class="fa fa-fw fa-credit-card-alt"></i></span>
	        	<span class="hidden-xs"><i class="fa fa-fw fa-credit-card-alt"></i> Make Payment</span>
	        </a>
	      </li>
	      <li class="nav-item">
	        <a class="nav-link btn btn-sm btn-outline-info rounded-lg" type="button" href="#" onclick="showAjaxModal_settings('<?php echo site_url('modal/popup/view_journals?from='.$from.'&to='.$to); ?>', 'View Journal Enquiries')">
	        	<span class="visible-xs"><i class="fas fa-fw fa-folder-open"></i></span>
	        	<span class="hidden-xs"><i class="fa fa-fw fa-folder-open"></i> Journal</span>
	        </a>
	      </li>
	    </ul>
	  </div>
	</nav>
</div>

<!--FOR SALES-->
<div class="tab-pane <?php if ($page_name == 'sales') {
	echo 'active';
}
?>" id="tab2">
	<nav class="navbar navbar-expand-lg navbar-dark">
	  <button class="navbar-toggler" type="button" data-toggle="collapse" data-target="#navbarSupportedContent" aria-controls="navbarSupportedContent" aria-expanded="false" aria-label="Toggle navigation">
	    <span class="navbar-toggler-icon"></span>
	  </button>

	  <div class="collapse navbar-collapse" id="navbarSupportedContent">
	    <ul class="navbar-nav mr-auto flex gap-3">
	      <li class="nav-item active">
	        <a class="nav-link btn btn-sm btn-outline-info rounded-lg" type="button" href="#" onclick="showAjaxModal_payments_sales('<?php echo site_url('modal/popup_sales/payments/'); ?>', 'New Payment')">
	        	<span class="visible-xs"><i class="fas fa-fw fa-hand-holding-usd"></i></span>
	        	<span class="hidden-xs"><i class="fas fa-fw fa-hand-holding-usd"></i> Take Payment</span>
	        </a>
	      </li>

	      <li class="nav-item">
	        <a class="nav-link btn btn-sm btn-outline-info rounded-lg" type="button" href="#" onclick="showAjaxModal_settings('<?php echo site_url('modal/popup_sales/view_receipts/'); ?>', 'View Receipts')">
	        	<span class="visible-xs"><i class="fas fa-fw fa-receipt"></i></span>
	        	<span class="hidden-xs"><i class="fa fa-fw fa-receipt"></i> View Receipts</span>
	        </a>
	      </li>
	      
	      <li class="nav-item">
	        <a class="nav-link btn btn-sm btn-outline-info rounded-lg" type="button" href="#" onclick="showAjaxModal_settings('<?php echo site_url('modal/popup/view_journals?from='.$from.'&to='.$to); ?>', 'View Journal Enquiries')">
	        	<span class="visible-xs"><i class="fas fa-fw fa-folder-open"></i></span>
	        	<span class="hidden-xs"><i class="fa fa-fw fa-folder-open"></i> Journal</span>
	        </a>
	      </li>

	      <li class="nav-item">
	        <a class="nav-link btn btn-sm btn-outline-success rounded-lg" type="button" href="#" onclick="showAjaxModal_proforma_invoice_create('<?php echo site_url('modal/popup_sales/create_proforma_invoice/'); ?>', 'Create Pro Forma Invoice')">
	        	<span class="visible-xs"><i class="fas fa-fw fa-file-invoice"></i></span>
	        	<span class="hidden-xs"><i class="fa fa-fw fa-file-invoice"></i> Create Pro Forma Invoice</span>
	        </a>
	      </li>
	    </ul>
	  </div>
	</nav>
</div>

<!--FOR PURCHASES-->
<div class="tab-pane <?php if ($page_name == 'purchases') {
	echo 'active';
}
?>" id="tab3">
	<nav class="navbar navbar-expand-lg navbar-dark">
	  <button class="navbar-toggler" type="button" data-toggle="collapse" data-target="#navbarSupportedContent" aria-controls="navbarSupportedContent" aria-expanded="false" aria-label="Toggle navigation">
	    <span class="navbar-toggler-icon"></span>
	  </button>

	  <div class="collapse navbar-collapse" id="navbarSupportedContent">
	    <ul class="navbar-nav mr-auto flex gap-3">
	      <li class="nav-item active">
	        <a class="nav-link btn btn-sm btn-outline-info rounded-lg" type="button" href="#" onclick="showAjaxModal_payments('<?php echo site_url('modal/popup_purchases/payments/'); ?>', 'Payments and Purchases')">
	        	<span class="visible-xs"><i class="fa fa-fw fa-credit-card-alt"></i></span>
	        	<span class="hidden-xs"><i class="fa fa-fw fa-credit-card-alt"></i> Payment</span>
	        </a>
	      </li>
	      <li class="nav-item">
	        <a class="nav-link btn btn-sm btn-outline-info rounded-lg" type="button" href="#" onclick="showAjaxModal_payments('<?php echo site_url('modal/popup_purchases/enter_payable/'); ?>', 'Record New Account Payable')">
	        	<span class="visible-xs"><i class="fas fa-fw fa-credit-card"></i></span>
	        	<span class="hidden-xs"><i class="fa fa-fw fa-credit-card"></i> Enter Payable</span>
	        </a>
	      </li>
	      <!--
	      <li class="nav-item">
	        <a class="nav-link btn btn-sm btn-outline-info" type="button" href="#" onclick="showAjaxModal_payments('<?php echo site_url('modal/popup_purchases/pay_payable/'); ?>', 'Enter Payment For Account Payable')">
	        	<span class="visible-xs"><i class="fas fa-fw fa-credit-card-alt"></i></span>
	        	<span class="hidden-xs"><i class="fa fa-fw fa-credit-card-alt"></i> Pay Payable</span>
	        </a>
	      </li> -->
	      <li class="nav-item">
	        <a class="nav-link btn btn-sm btn-outline-info rounded-lg" type="button" href="#" onclick="showAjaxModal_settings('<?php echo site_url('modal/popup/view_journals?from='.$from.'&to='.$to); ?>', 'View Journal Enquiries')">
	        	<span class="visible-xs"><i class="fas fa-fw fa-folder-open"></i></span>
	        	<span class="hidden-xs"><i class="fa fa-fw fa-folder-open"></i> Journal</span>
	        </a>
	      </li>

	    </ul>
	  </div>
	</nav>
</div>

<!--FOR BANKING-->
<div class="tab-pane <?php if ($page_name == 'banking') {
	echo 'active';
}
?>" id="tab4">
	<nav class="navbar navbar-expand-lg navbar-dark">
	  <button class="navbar-toggler" type="button" data-toggle="collapse" data-target="#navbarSupportedContent" aria-controls="navbarSupportedContent" aria-expanded="false" aria-label="Toggle navigation">
	    <span class="navbar-toggler-icon"></span>
	  </button>

	  <div class="collapse navbar-collapse" id="navbarSupportedContent">
	    <ul class="navbar-nav mr-auto flex gap-3">
	      <li class="nav-item active">
	        <a class="nav-link btn btn-sm btn-outline-info rounded-lg" type="button" href="#" onclick="showAjaxModal_settings('<?php echo site_url('modal/popup_banking/account_enquiry/'); ?>', 'View Accounts Enquiries')">
	        	<span class="visible-xs"><i class="fas fa-fw fa-search"></i></span>
	        	<span class="hidden-xs"><i class="fa fa-fw fa-search"></i> Accounts Enquiries</span>
	        </a>
	      </li>
	      <li class="nav-item">
	        <a class="nav-link btn btn-sm btn-outline-info rounded-lg" type="button" href="#" onclick="showAjaxModal_data_create('<?php echo site_url('modal/popup_banking/account_transfer/'); ?>', 'Accounts Transfer')">
	        	<span class="visible-xs"><i class="fas fa-fw fa-exchange-alt"></i></span>
	        	<span class="hidden-xs"><i class="fas fa-exchange-alt"></i> Transfer</span>
	        </a>
	      </li>
	      <li class="nav-item">
	        <a class="nav-link btn btn-sm btn-outline-info rounded-lg" type="button" href="#" onclick="showAjaxModal_settings('<?php echo site_url('modal/popup/view_journals?from='.$from.'&to='.$to); ?>', 'View Journal Enquiries')">
	        	<span class="visible-xs"><i class="fas fa-fw fa-folder-open"></i></span>
	        	<span class="hidden-xs"><i class="fa fa-fw fa-folder-open"></i> Journal</span>
	        </a>
	      </li>
	    </ul>
	  </div>
	</nav>
</div>

<!--FOR REPORTS-->
<div class="tab-pane <?php if ($page_name == 'reports') {
	echo 'active';
}
?>" id="tab5">
	<nav class="navbar navbar-expand-lg navbar-dark">
	  <button class="navbar-toggler" type="button" data-toggle="collapse" data-target="#navbarSupportedContent" aria-controls="navbarSupportedContent" aria-expanded="false" aria-label="Toggle navigation">
	    <span class="navbar-toggler-icon"></span>
	  </button>

	  <div class="collapse navbar-collapse" id="navbarSupportedContent">
	    <ul class="navbar-nav mr-auto">
	      <li class="nav-item active">
	        <a class="nav-link btn btn-sm btn-outline-info rounded-lg" type="button" href="#">
	        	<span class="visible-xs"><i class="fas fa-fw fa-bar-chart"></i></span>
	        	<span class="hidden-xs"><i class="fa fa-fw fa-bar-chart"></i> Reports</span>
	        </a>
	      </li>
	    </ul>
	  </div>
	</nav>
</div>