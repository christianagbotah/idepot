

  <!-- Nav Item - banking -->
  <li class="nav-item active">
    <a class="nav-link" href="<?php echo site_url('admin/banking'); ?>">
      <i class="fas fa-fw fa-landmark"></i>
      <span>Banking</span></a>
  </li>
  <li  class="list-group navbar-nav bg-gradient-primary sidebar-dark accordion">
               
            <!-- BANKING NAV -->
            <!-- Divider -->
            <hr class="sidebar-divider my-0">

            <!-- Nav Item - banking Collapse Menu -->
            <li class="nav-item ">
              <a class="nav-link collapsed" href="#" data-toggle="collapse" data-target="#collapseBanking" aria-expanded="true" aria-controls="collapseBanking">
                <i class="fas fa-fw fa-landmark"></i>
                <span>Banking</span>
              </a>
              <div id="collapseBanking" class="collapse" aria-labelledby="headingBanking" data-parent="#nav_items_holder">
                <div class="bg-white py-2 collapse-inner rounded">
                  <a class="collapse-item" href="#" onclick="showAjaxModal_settings('<?php echo site_url('modal/popup_banking/account_enquiry/');?>', 'View Accounts Enquiries')">Accounts Enquiries</a>
                  <!-- Divider -->
                  <hr class="sidebar-divider my-0">
                  <a class="collapse-item" href="#" onclick="showAjaxModal_data_create('<?php echo site_url('modal/popup_banking/account_transfer/');?>', 'Accounts Transfer')">Accounts transfer</a>
                </div>
              </div>
            </li>

            <!-- Divider -->
            <hr class="sidebar-divider">
            <!-- Nav Item - Settings Collapse Menu -->
            <li class="nav-item">
              <a class="nav-link" href="#" onclick="showAjaxModal_settings('<?php echo site_url('modal/popup/system_settings/');?>');">
                <i class="fas fa-fw fa-cog fa-spin"></i>
                <span>Settings</span></a>
            </li>
            <!-- Divider -->
            <hr class="sidebar-divider d-none d-md-block">
</li>