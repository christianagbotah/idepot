<?php 
// Batch load settings
$settings = $this->db->where_in('type', array('currency', 'opening_day'))->get('settings')->result_array();
$settings_map = array_column($settings, 'description', 'type');

$currency = $settings_map['currency'] ?? '';
$opening_day = $settings_map['opening_day'] ?? 'monday';
$fmt = new NumberFormatter('en_US', NumberFormatter::CURRENCY);

$from = date('d-m-Y', strtotime('this week '. $opening_day));
$to = date('d-m-Y');

$this->db->where('account_is_transferrable', 1);
$accounts = $this->db->get('accounts')->result_array();
?>

  

          <!-- Page Heading -->
          <div class="d-sm-flex align-items-center justify-content-between mb-4">
            <h1 class="h3 mb-0 text-gray-800">
                <i class="entypo-right-circled"></i>
                  <?php echo $page_title;?>
            </h1>
            <a href="JavaScript:;" class="d-none d-sm-inline-block btn btn-sm btn-success shadow-lg rounded-lg p-4 calendar_pop" onclick="showAjaxModal_calendar('<?php echo site_url('modal/popup_calendar/calendar/');?>');"><i class="fas fa-calendar fa-sm text-white-50"></i> Calendar</a>
          </div>

          <div class="row">

            <?php 
              foreach($accounts as $account):
                $balance = $account['current_balance'] ?? 0;
                $account_name = $account['name'] ?? '';
                $account_id = $account['account_id'] ?? 0;
                
                if($balance < 100) {
                  $border_color = 'danger';
                  $text_color = 'danger';
                } else if($balance >= 100 && $balance <= 4000) {
                  $border_color = 'warning';
                  $text_color = 'warning';
                } else if($balance >= 60000) {
                  $border_color = 'success';
                  $text_color = 'success';
                } else {
                  $border_color = 'primary';
                  $text_color = 'primary';
                }
                ?>
                <!-- Accounts Balances -->
                <div class="col-xl-3 col-md-6 mb-4">
                  <div class="card border-left-<?=$border_color; ?> shadow h-100 py-2">
                    <div class="card-body">
                      <div class="row no-gutters align-items-center">
                        <div class="col mr-2">
                          <div class="text-xs font-weight-bold text-<?=$text_color; ?> text-uppercase mb-1"><?=strtoupper($account_name); ?> 
                          <?php
                            if(strtoupper($account_name) == 'IMPREST' || strtoupper($account_name) == 'PETTY CASH') {
                              ?>
                                <div class="pull-right"><a href="javascript:void(0);" title="add fund" onclick="showAjaxModal_data_create('<?php echo site_url('modal/popup_banking/account_transfer/'.$account_id);?>', 'Accounts Transfer')" class="btn btn-outline-success font-weight-bold">TOPUP</a></div>
                              <?php
                            }
                          ?>
                        </div> 
                          <div class="h5 mb-0 font-weight-bold text-gray-800"><?=numfmt_format_currency($fmt, $balance, $currency); ?></div>
                        </div>
                        <div class="col-auto">
                          <i class="fas fa-dollar-sign fa-2x text-gray-300"></i>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <?php
              endforeach;
            ?>
            
          </div>

          <div class="row">

            <div class="col-lg-6 col-md-6">

              <!-- Collapsable Card Example -->
              <div class="card shadow mb-4">
                <!-- Card Header - Accordion -->
                <a href="#collapseCardPurchases1" class="d-block card-header py-3" data-toggle="collapse" role="button" aria-expanded="true" aria-controls="collapseCardPurchases1">
                  <h6 class="m-0 font-weight-bold text-info">Accounts Enquiries</h6>
                </a>
                <!-- Card Content - Collapse -->
                <div class="collapse show" id="collapseCardPurchases1">
                  <div class="card-body">

                    <div class="row">
                      <div class="col-lg-12 col-md-12 mb-4">
                        <a href="#" style="text-decoration: none;" onclick="showAjaxModal_settings('<?php echo site_url('modal/popup_banking/account_enquiry?from='.$from.'&to='.$to);?>', 'View Accounts Enquiries')">
                        <div class="card bg-info text-white shadow">
                          <div class="card-body">
                            Accounts Enquiries
                            <div class="text-white-50 small">Transactions On Bank Accounts</div>
                          </div>
                        </div>
                        </a>
                      </div>
                    </div>

                  </div>
                </div>
              </div>
            </div>

            <div class="col-lg-6 col-md-6">
              <!-- Collapsable Card Example -->
              <div class="card shadow mb-4">
                <!-- Card Header - Accordion -->
                <a href="#collapseCardPurchases2" class="d-block card-header py-3" data-toggle="collapse" role="button" aria-expanded="true" aria-controls="collapseCardPurchases2">
                  <h6 class="m-0 font-weight-bold text-info">Accounts Transfer</h6>
                </a>
                <!-- Card Content - Collapse -->
                <div class="collapse show" id="collapseCardPurchases2">
                  <div class="card-body">

                    <div class="row">
                      <div class="col-lg-12 col-md-12 mb-4">
                        <a href="#" style="text-decoration: none;" onclick="showAjaxModal_data_create('<?php echo site_url('modal/popup_banking/account_transfer/');?>', 'Accounts Transfer')">
                        <div class="card bg-info text-white shadow">
                          <div class="card-body">
                            Transfer Between Accounts
                            <div class="text-white-50 small">Transfer Money</div>
                          </div>
                        </div>
                        </a>
                      </div>
                    </div>

                  </div>
                </div>
              </div>
            </div>

          </div>


          <script type="text/javascript">

$(function($) {
  
  loadNavMenu();    

})

function loadNavMenu() {

  $('#nav_menu_loading_holder').html('<center class="mt-5"><i class="fa fa-spinner fa-pulse fa-3x"></i><br/><p>Loading Sidebar Menu</p></center>'); //pre-loader
  $.ajax({
    url: '<?php echo site_url('admin/loadContents/banking/freshLoad') ?>',
    type: 'post',
    dataType: 'json',
    cache: false
  })
  .done(function(response) {
  
    //load nav menu
    $('#nav_items_holder').html(response.navMenu);
    $('#nav_menu_loading_holder').slideUp('slow');
    $('#nav_items_holder').slideDown('slow');


  })
  .fail(function(err) {

  });
}
</script>
        