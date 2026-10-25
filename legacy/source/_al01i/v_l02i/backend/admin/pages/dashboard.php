  <!-- Page Wrapper -->
  <?php

  /*$this->db->select('*');
  $this->db->from('invoice');
  $this->db->order_by('invoice_id', 'asc');
  $ids = $this->db->get()->result_array();

  $arr = $this->crud_model->array_unique_multidimensional($ids);

  var_dump($arr)*/;

  /*echo strtotime(date('08-04-2024')).'<br/>';
  echo strtotime(date('08-04-2024 H:i:s')).'<br/>';*/

  /*echo 'Today '.strtotime('today').'<br/>';
  echo 'Now '.strtotime('now').'<br/>';*/

  $current_user_id = $this->session->userdata('login_user_id') ?? 0;

  $welcome_shown_today = $this->db->get_where('admin', ['admin_id' => $current_user_id])->row()->welcome_shown_date;

// Batch load settings
$settings_row = $this->db->get_where('settings', array('type' => 'currency'))->row();
$currency = $settings_row->description ?? '';
$fmt = new NumberFormatter('en_US', NumberFormatter::CURRENCY);

// Batch load all monthly sales data in single query
$year_start = strtotime(date('d-m-Y', strtotime('first day of january this year')));
$year_end = strtotime(date('d-m-Y', strtotime('last day of december this year')));

$this->db->select('timestamp, credit_amount');
$this->db->where('account_name', 'General Sales');
$this->db->where('timestamp >=', $year_start);
$this->db->where('timestamp <=', $year_end);
$sales_data = $this->db->get('general_journal')->result_array();

// Initialize monthly totals
$monthly_sales = array_fill(1, 12, 0);

// Group sales by month
foreach ($sales_data as $sale) {
    $month = (int)date('n', $sale['timestamp'] ?? 0);
    $monthly_sales[$month] += $sale['credit_amount'] ?? 0;
}

// Assign to individual variables
$jan = $monthly_sales[1];
$feb = $monthly_sales[2];
$mar = $monthly_sales[3];
$apr = $monthly_sales[4];
$may = $monthly_sales[5];
$jun = $monthly_sales[6];
$jul = $monthly_sales[7];
$aug = $monthly_sales[8];
$sep = $monthly_sales[9];
$oct = $monthly_sales[10];
$nov = $monthly_sales[11];
$dec = $monthly_sales[12];
?>

  <style type="text/css">
    .fc-event-title {
      font-size: 10px !important;
    }
  </style>
          <!-- <div>
            <button class="btn btn-info btn-lg" id="updateButton" onclick="populateButton()">Populate Table</button>
          </div> -->


          <!-- Page Heading -->
          <div class="d-sm-flex align-items-center justify-content-between mb-4">
            <h1 class="h3 mb-0 text-gray-800">
                <i class="entypo-right-circled"></i>
                  <?php echo $page_title; ?>
            </h1>
            <a href="#" class="d-none d-sm-inline-block btn btn-sm btn-success shadow-lg rounded-lg p-4  calendar_pop" onclick="showAjaxModal_calendar('<?php echo site_url('modal/popup_calendar/calendar/'); ?>');"><i class="fas fa-calendar fa-sm text-white-50"></i> Calendar</a>
          </div>

          <!-- Content Row -->
          <div class="row">

            <!-- Earnings (Monthly) Card Example -->
            <div class="col-xl-3 col-md-6 mb-4">
              <a href="<?php echo site_url('admin/purchases');?>" onclick="showPageLoading()">
                <div class="card border-left-danger shadow h-100 py-2">
                  <div class="card-body">
                    <div class="row no-gutters align-items-center">
                      <div class="col mr-2">
                        <div class="text-xs font-weight-bold text-danger text-uppercase mb-1">PURCHASES PORTAL</div>
                        <div class="h5 mb-0 font-weight-lighter text-muted">ALL PURCHASES INFO</div>
                      </div>
                      <div class="col-auto">
                        <i class="fas fa-dollar-sign fa-2x text-gray-300"></i>
                      </div>
                    </div>
                  </div>
                </div>
              </a>
            </div>

            <!-- Earnings (Monthly) Card Example -->
            <div class="col-xl-3 col-md-6 mb-4">
              <a href="<?php echo site_url('admin/sales');?>" onclick="showPageLoading()">
                <div class="card border-left-success shadow h-100 py-2">
                  <div class="card-body">
                    <div class="row no-gutters align-items-center">
                      <div class="col mr-2">
                        <div class="text-xs font-weight-bold text-success text-uppercase mb-1">SALES PORTAL</div>
                        <div class="h5 mb-0 font-weight-lighter text-muted text-gray-800">ALL SALES INFO</div>
                      </div>
                      <div class="col-auto">
                        <i class="fas fa-dollar-sign fa-2x text-gray-300"></i>
                      </div>
                    </div>
                  </div>
                </div>
              </a>
            </div>

            <div class="col-xl-3 col-md-6 mb-4">
              <a href="<?php echo site_url('admin/banking');?>" onclick="showPageLoading()">
                <div class="card border-left-primary shadow h-100 py-2">
                  <div class="card-body">
                    <div class="row no-gutters align-items-center">
                      <div class="col mr-2">
                        <div class="text-xs font-weight-bold text-primary text-uppercase mb-1">BANK</div>
                        <div class="h5 mb-0 text-muted font-weight-lighter text-gray-800">ALL BANKING INFO</div>
                      </div>
                      <div class="col-auto">
                        <i class="fas fa-dollar-sign fa-2x text-gray-300"></i>
                      </div>
                    </div>
                  </div>
                </div>
              </a>
            </div>

            <div class="col-xl-3 col-md-6 mb-4">
                <a href="<?php echo site_url('admin/reports');?>" onclick="showPageLoading()">
                <div class="card border-left-info shadow h-100 py-2">
                  <div class="card-body">
                    <div class="row no-gutters align-items-center">
                      <div class="col mr-2">
                        <div class="text-xs font-weight-bold text-info text-uppercase mb-1">REPORTS PORTAL</div>
                        <div class="h5 mb-0 font-weight-lighter text-muted text-gray-800">ALL REPORTS INFO</div>
                      </div>
                      <div class="col-auto">
                        <i class="fas fa-dollar-sign fa-2x text-gray-300"></i>
                      </div>
                    </div>
                  </div>
                </div>
              </a>
            </div>
          </div>

          <!-- Content Row -->

          <div class="row">

            <!-- Area Chart -->
            <div class="col-xl-12 col-lg-12 col-md-12">
              <div class="card shadow mb-4">
                <!-- Card Header - Dropdown -->
                <div class="card-header py-3 d-flex flex-row align-items-center justify-content-between">
                  <h6 class="m-0 font-weight-bold text-primary">General Sales Overview</h6>
                  <div class="dropdown no-arrow">
                    <a class="dropdown-toggle" href="#" role="button" id="dropdownMenuLink" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
                      <i class="fas fa-ellipsis-v fa-sm fa-fw text-gray-400"></i>
                    </a>
                    <div class="dropdown-menu dropdown-menu-right shadow animated--fade-in" aria-labelledby="dropdownMenuLink">
                      
                    </div>
                  </div>
                </div>
                <!-- Card Body -->
                <div class="card-body">
                  <div class="chart-area">
                    <canvas id="myAreaChart"></canvas>
                  </div>
                </div>
              </div>
            </div>            
          </div>

        </div>
      
        <!-- Welcome Modal -->
        <?php if($welcome_shown_today != date('Y-m-d') || $welcome_shown_today == NULL): ?>
        <div class="modal fade" id="welcomeModal" tabindex="-1" role="dialog">
          <div class="modal-dialog" role="document">
            <div class="modal-content">
              <div class="modal-header bg-success text-white">
                <h4 class="modal-title text-gray-100"><i class="fas fa-sun"></i> Good Morning!</h4>
                <button type="button" class="close text-white" data-dismiss="modal">&times;</button>
              </div>
              <div class="modal-body text-center">
                <div class="mb-3">
                  <i class="fas fa-user-check fa-3x text-success"></i>
                </div>
                <h5>Welcome, <?php echo $this->session->userdata('name'); ?>!</h5>
                <p><?php echo $this->session->flashdata('welcome_message'); ?></p>
                <p class="text-muted">Have a productive day ahead!</p>
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-success" data-dismiss="modal">Let's Get Started!</button>
              </div>
            </div>
          </div>
        </div>
        <?php endif; ?>

        <script type="text/javascript">

$(function($) {
  
  loadNavMenu();
  
  // Show welcome modal for first login (only once per day)
  <?php if($welcome_shown_today != date('Y-m-d') || $welcome_shown_today == NULL): ?>
  setTimeout(function() {
    $('#welcomeModal').modal('show');
    // Mark welcome as shown for today
    $.post('<?php echo site_url('admin/mark_welcome_shown'); ?>');
  }, 1000);
  <?php endif; ?>

})

function loadNavMenu() {

  $('#nav_menu_loading_holder').html('<center class="mt-5"><i class="fa fa-spinner fa-pulse fa-3x"></i><br/><p>Loading Sidebar Menu</p></center>'); //pre-loader

  $.ajax({
    url: '<?php echo site_url('admin/loadContents/dashboard/freshLoad') ?>',
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

<!--BOOTSTRAP 4 TEMPLATE SCRIPTS-->
<script type="text/javascript">

  function populateButton() {

    showAjaxModal_confirm('<div><center>Executing your task. Please wait...<br/><br/><i class="fa fa-spinner fa-2x fa-pulse"></i></center></div>', 'Loading');


    $.ajax({
      url: '<?php echo site_url('admin/populateAccountsUsedTable'); ?>',
      type: 'post',
      dataType: 'json',
      cache: false,
    })
    .done(function(resp) {

      if(resp.success) {
        showAjaxModal_confirm('Task completed successfully.', 'Success');

      } else if(resp.success == 'exists') {
        showAjaxModal_confirm('Error: Records already exist in the table!', 'Error');
      } else {
        showAjaxModal_confirm('Error: Romething happened and we could not perform the task!', 'Error');
      }
    })
    .fail(function(err) {
      showAjaxModal_confirm('Error: ' + err.responseText, 'Error');
    })
  }


    let currency = '<?=$currency; ?> ';

    //monthly selections
    let jan = <?=$jan; ?>;
    let feb = <?=$feb; ?>;
    let mar = <?=$mar; ?>;
    let apr = <?=$apr; ?>;
    let may = <?=$may; ?>;
    let jun = <?=$jun; ?>;
    let jul = <?=$jul; ?>;
    let aug = <?=$aug; ?>;
    let sep = <?=$sep; ?>;
    let oct = <?=$oct; ?>;
    let nov = <?=$nov; ?>;
    let dec = <?=$dec; ?>;


    function updateUnitQuantity() {

      showAjaxModal_confirm('Please wait. Executing your request... <i class="fa fa-spinner fa-pulse"></i>', 'Loading');

      $.ajax({
        url: '<?php echo site_url('admin/updateUnitQuantity'); ?>',
        type: 'POST',
        dataType: 'json',
        cache: false,

      })
      .done(function(response) {

        if(response.success) {
          showAjaxModal_confirm(response.message, 'Success');
        } else {
          showAjaxModal_confirm(response.message, 'Error');
        }

      })
      .fail(function(err) {
        showAjaxModal_confirm(err.responseText + '. Ooopz something happened that we cannot account for ow. Please try again, but check your internet connectivity.', 'Error');
      })
    }


</script>

<!-- Page level plugins -->
<script src="<?php echo base_url('assets/bootstrap4-theme/vendor/chart.js/Chart.min.js'); ?>"></script>


<!-- Page level custom scripts -->
<script src="<?php echo base_url('assets/bootstrap4-theme/js/demo/chart-area-demo.js'); ?>"></script> <!--BOOTSTRAP 4 TEMPLATE SCRIPTS END-->






  <a class="scroll-to-top rounded" href="#page-body-top">
    <i class="fas fa-angle-up"></i>
  </a>
