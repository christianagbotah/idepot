

  

          <!-- Page Heading -->
          <div class="d-sm-flex align-items-center justify-content-between mb-4">
            <h1 class="h3 mb-0 text-gray-800">
                <i class="entypo-right-circled"></i>
                  <?php echo $page_title;?>
            </h1>
            <a href="JavaScript:;" class="d-none d-sm-inline-block btn btn-sm btn-success shadow-lg rounded-lg p-4 calendar_pop" onclick="showAjaxModal_calendar('<?php echo site_url('modal/popup_calendar/calendar/');?>');"><i class="fas fa-calendar fa-sm text-white-50"></i> Calendar</a>
          </div>

          <div class="row">

           <!-- <div class="col-lg-6 col-md-6">

              <div class="card shadow mb-4">

                <a href="#collapseCardPurchases1" class="d-block card-header py-3" data-toggle="collapse" role="button" aria-expanded="true" aria-controls="collapseCardPurchases1">
                  <h6 class="m-0 font-weight-bold text-warning">Quick Reports</h6>
                </a>
       
                <div class="collapse show" id="collapseCardPurchases1">
                  <div class="card-body">

                    <div class="row">
                      <div class="col-lg-12 col-md-12 mb-4">
                        <div class="card bg-warning text-white shadow">
                          <div class="card-body">
                            Quick Report <span class="pull-right text-danger">Please use the menu links on your left</span>
                            <div class="text-white-50 small">Generate Quick Report</div>
                          </div>
                        </div>
                      </div>
                    </div>

                  </div>
                </div>
              </div>
            </div> -->

            <div class="col-lg-12 col-md-12">
              <!-- Collapsable Card Example -->
              <div class="card shadow mb-4">
                <!-- Card Header - Accordion -->
                <a href="#collapseCardPurchases2" class="d-block card-header py-3" data-toggle="collapse" role="button" aria-expanded="true" aria-controls="collapseCardPurchases2">
                  <h6 class="m-0 font-weight-bold text-warning">Reports</h6>
                </a>
                <!-- Card Content - Collapse -->
                <div class="collapse show" id="collapseCardPurchases2">
                  <div class="card-body">

                    <div class="row">
                      <div class="col-lg-12 col-md-12 mb-4">
                        <div class="card bg-warning text-white shadow">
                          <div class="card-body">
                           <i class="fa fa-fw fa-10x fa-bar-chart"></i>
                          </div>
                        </div>
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
    url: '<?php echo site_url('admin/loadContents/reports/freshLoad') ?>',
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