    <script type="text/javascript">

    function showAjaxModal(url, $param = '')
    {
        //expand the size of the modal if the page name is take_payment
        if($param == 'take_payment' || $param == 'modal_unpaid_invoices' || $param == 'make_refund') {
            $('#modal_ajax .modal-content').css({
                'left' : '-325px',
                'width' : '1250px'
            });
        }
        // SHOWING AJAX PRELOADER IMAGE
        $('#modal_ajax .modal-body').html('<div style="text-align:center;margin-top:200px;"><img src="assets/images/validate.gif" width="64px" /></div>');

        $('#modal_ajax .modal-body').html('<div style="text-align:center;margin-top:200px;"><img src="<?php echo base_url();?>assets/images/validate.gif" width="64px"/></div>');
        // LOADING THE AJAX MODAL
        $('#modal_ajax').modal('show', {backdrop: 'true'});

        // SHOW AJAX RESPONSE ON REQUEST SUCCESS
        $.ajax({
            url: url,
            success: function(response)
            {
                $('#modal_ajax .modal-body').html(response);
            }
        });
    }

    function showAjaxModal_calendar(url, header = 'Calendar')
    {
        // SHOWING AJAX PRELOADER IMAGE
        $('#modal_calendar .modal-body').html('<div style="text-align:center;margin-top:100px;"><img src="assets/images/validate.gif" width="64px" /></div>');

        $('#modal_calendar .modal-title').text(header);

        $('#modal_calendar .modal-body').html('<div style="text-align:center;margin-top:200px;"><img src="<?php echo base_url(); ?>assets/images/validate.gif" width="64px"/></div>');
        // LOADING THE AJAX MODAL
        $('#modal_calendar').modal('show', {backdrop: 'false', keyboard: 'false'});

        // SHOW AJAX RESPONSE ON REQUEST SUCCESS
        $.ajax({
            url: url,
            success: function(response)
            {
                $('#modal_calendar .modal-body').html(response);
            }
        });
    }

    //logout
    function showAjaxModal_logout(url)
    {
        // SHOWING AJAX PRELOADER IMAGE
        $('#logoutModal .modal-footer').html('<div style="text-align:center;margin-top:100px;"><img src="assets/images/validate.gif" width="64px" /></div>');

        $('#logoutModal .modal-footer').html('<div style="text-align:center;margin-top:200px;"><img src="<?php echo base_url(); ?>assets/images/validate.gif" width="64px"/></div>');
        // LOADING THE AJAX MODAL
        $('#logoutModal').modal('show', {backdrop: 'false', keyboard: 'false'});

        // SHOW AJAX RESPONSE ON REQUEST SUCCESS
        $.ajax({
            url: url,
            success: function(response)
            {
                $('#logoutModal .modal-footer').html(response);
            }
        });
    }

    //cash or goods
    function showAjaxModal_cash_good(url, customer_id)
    {
        // SHOWING AJAX PRELOADER IMAGE
        $('#cash_goods .modal-footer').html('<div style="text-align:center;margin-top:100px;"><img src="assets/images/validate.gif" width="64px" /></div>');

        $('#cash_goods .modal-footer').html('<div style="text-align:center;margin-top:200px;"><img src="<?php echo base_url(); ?>assets/images/validate.gif" width="64px"/></div>');
        // LOADING THE AJAX MODAL
        $('#cash_goods').modal('show', {backdrop: 'false', keyboard: 'false'});

        // SHOW AJAX RESPONSE ON REQUEST SUCCESS
        $.ajax({
            url: url,
            success: function(response)
            {
                $('#cash_goods .modal-footer').html(response);

                $('#goods').click(function(event) {
                  /* Act on the event */
                  $(this).attr('data-dismiss', 'modal');
                  $('.close').click(); //close the current modal
                showAjaxModal_data_create('<?php echo site_url('modal/popup_sales/add_sales_order_negative_bal/'); ?>' + customer_id, 'Payment With Goods')
                });
            }
        });
    }

    //cash or goods
    function showAjaxModal_overpayment(url)
    {
        // SHOWING AJAX PRELOADER IMAGE
        $('#overpayment .modal-body').html('<div style="text-align:center;margin-top:100px;"><img src="assets/images/validate.gif" width="64px" /></div>');

        $('#overpayment .modal-body').html('<div style="text-align:center;margin-top:200px;"><img src="<?php echo base_url(); ?>assets/images/validate.gif" width="64px"/></div>');
        // LOADING THE AJAX MODAL
        $('#overpayment').modal('show', {backdrop: 'false', keyboard: 'false'});

        // SHOW AJAX RESPONSE ON REQUEST SUCCESS
        $.ajax({
            url: url,
            success: function(response)
            {
                $('#overpayment .modal-body strong').html(response);

                $('#yes_button').click(function(event) {
                  $('#payments_form input[type="submit"]').click();
                });
            }
        });
    }

    //system main
    function showAjaxModal_settings(url, title)
    {
        // SHOWING AJAX PRELOADER IMAGE
        $('#main .modal-content').css({
                'left' : '-365px',
                'width' : '1250px'
            });
        $('#main .modal-body').html('<div style="text-align:center;margin-top:100px;"><img src="assets/images/validate.gif" width="64px" /></div>');

        $('#main .modal-body').html('<div style="text-align:center;margin-top:200px;"><img src="<?php echo base_url(); ?>assets/images/validate.gif" width="64px"/></div>');
        // LOADING THE AJAX MODAL
        $('#main').modal('show', {backdrop: 'false', keyboard: 'false'});

        $('#main .modal-title').html(title);

        // SHOW AJAX RESPONSE ON REQUEST SUCCESS
        $.ajax({
            url: url,
            success: function(response)
            {
                $('#main .modal-body').html(response);
                $('#main .modal-title').html(title);
            }
        });
    }


    //data create
    function showAjaxModal_data_create(url, title)
    {
        // SHOWING AJAX PRELOADER IMAGE
        $('#create .modal-content').css({
                'left' : '-160px',
                'width' : '900px'
            });
        $('#create .modal-body').html('<div style="text-align:center;margin-top:100px;"><img src="assets/images/validate.gif" width="64px" /></div>');

        $('#create .modal-title').html(title);

        $('#create .modal-body').html('<div style="text-align:center;margin-top:200px;"><img src="<?php echo base_url(); ?>assets/images/validate.gif" width="64px"/></div>');
        // LOADING THE AJAX MODAL
        $('#create').modal('show', {backdrop: 'false', keyboard: 'false'});

        // SHOW AJAX RESPONSE ON REQUEST SUCCESS
        $.ajax({
            url: url,
            success: function(response)
            {
                $('#create .modal-body').html(response);
                $('#create .modal-title').html(title);
            }
        });
    }

    //proforma invoice create
    function showAjaxModal_proforma_invoice_create(url, title)
    {
        // SHOWING AJAX PRELOADER IMAGE
        $('#create_proforma_invoice .modal-content').css({
                'left' : '-160px',
                'width' : '900px'
            });
        $('#create_proforma_invoice .modal-body').html('<div style="text-align:center;margin-top:100px;"><img src="assets/images/validate.gif" width="64px" /></div>');

        $('#create_proforma_invoice .modal-title').html(title);

        $('#create_proforma_invoice .modal-body').html('<div style="text-align:center;margin-top:200px;"><img src="<?php echo base_url(); ?>assets/images/validate.gif" width="64px"/></div>');
        // LOADING THE AJAX MODAL
        $('#create_proforma_invoice').modal('show', {backdrop: 'false', keyboard: 'false'});

        // SHOW AJAX RESPONSE ON REQUEST SUCCESS
        $.ajax({
            url: url,
            success: function(response)
            {
                $('#create_proforma_invoice .modal-body').html(response);
                $('#create_proforma_invoice .modal-title').html(title);
            }
        });
    }

    //data create
    function showAjaxModal_receipt(url, body, title)
    {
        // SHOWING AJAX PRELOADER IMAGE
        $('#create .modal-content').css({
                'left' : '-160px',
                'width' : '900px'
            });
        $('#create .modal-body').html('<div style="text-align:center;margin-top:100px;"><img src="assets/images/validate.gif" width="64px" /></div>');

        $('#create .modal-title').html(title);

        $('#create .modal-body').html('<div style="text-align:center;margin-top:200px;"><img src="<?php echo base_url(); ?>assets/images/validate.gif" width="64px"/></div>');
        // LOADING THE AJAX MODAL
        $('#create').modal('show', {backdrop: 'false', keyboard: 'false'});

        // SHOW AJAX RESPONSE ON REQUEST SUCCESS
        $.ajax({
            url: url,
            success: function(response)
            {
                $('#create .modal-body').html(body);
                $('#create .modal-title').html(title);
            }
        });
    }

     //payments
    function showAjaxModal_payments(url, title)
    {
        // SHOWING AJAX PRELOADER IMAGE
        $('#payments .modal-content').css({
                'left' : '-70px',
                'width' : '600px'
            });

        $('#payments .modal-body').html('<div style="text-align:center;margin-top:100px;"><img src="assets/images/validate.gif" width="64px" /></div>');

        $('#payments .modal-title').html(title);

        $('#payments .modal-body').html('<div style="text-align:center;margin-top:200px;"><img src="<?php echo base_url(); ?>assets/images/validate.gif" width="64px"/></div>');
        // LOADING THE AJAX MODAL
        $('#payments').modal('show', {backdrop: 'false', keyboard: 'false'});

        // SHOW AJAX RESPONSE ON REQUEST SUCCESS
        $.ajax({
            url: url,
            success: function(response)
            {
                $('#payments .modal-body').html(response);
                $('#payments .modal-title').html(title);
            }
        });
    }

     //payments_sales
    function showAjaxModal_payments_sales(url, title)
    {
        // SHOWING AJAX PRELOADER IMAGE
        $('#payments_sales .modal-content').css({
                'left' : '-70px',
                'width' : '600px'
            });

        $('#payments_sales .modal-body').html('<div style="text-align:center;margin-top:100px;"><img src="assets/images/validate.gif" width="64px" /></div>');

        $('#payments_sales .modal-title').html(title);

        $('#payments_sales .modal-body').html('<div style="text-align:center;margin-top:200px;"><img src="<?php echo base_url(); ?>assets/images/validate.gif" width="64px"/></div>');
        // LOADING THE AJAX MODAL
        $('#payments_sales').modal('show', {backdrop: 'false', keyboard: 'false'});

        // SHOW AJAX RESPONSE ON REQUEST SUCCESS
        $.ajax({
            url: url,
            success: function(response)
            {
                $('#payments_sales .modal-body').html(response);
                $('#payments_sales .modal-title').html(title);
            }
        });
    }

    //success-error
    function showAjaxModal_confirm(message, type)
    {
        // SHOWING AJAX PRELOADER IMAGE

        //change background of modal depending the confirmation type
        if(type == 'success' || type == 'Success' || type == 'Logged Out') {
            $('#modal_confirm .modal-header').removeClass('bg-danger');
            $('#modal_confirm .modal-header').removeClass('bg-warning');
            $('#modal_confirm .modal-header').removeClass('bg-info');
            $('#modal_confirm .modal-header').addClass('bg-success');
            $('#modal_confirm .modal-body').removeClass('bg-danger');
            $('#modal_confirm .modal-body').removeClass('bg-info');
            $('#modal_confirm .modal-body').removeClass('bg-warning');
            $('#modal_confirm .modal-body').addClass('bg-success');

            // LOADING THE AJAX MODAL
            $('#modal_confirm').modal('show', {backdrop: 'false', keyboard: 'false'});
            $('#modal_confirm .modal-body h3').html(message);
            $('#modal_confirm .modal-title').html(type);

        } else if(type == 'error' || type == 'Error') {
            $('#modal_confirm .modal-header').removeClass('bg-success');
            $('#modal_confirm .modal-header').removeClass('bg-warning');
            $('#modal_confirm .modal-header').addClass('bg-danger');
            $('#modal_confirm .modal-body').removeClass('bg-success');
            $('#modal_confirm .modal-body').removeClass('bg-warning');
            $('#modal_confirm .modal-body').addClass('bg-danger');

            // LOADING THE AJAX MODAL
            $('#modal_confirm').modal('show', {backdrop: 'false', keyboard: 'false'});
            $('#modal_confirm .modal-body h3').html(message);
            $('#modal_confirm .modal-title').html(type);

        } else if(type == 'warning' || type == 'Warning') {
            $('#modal_confirm .modal-header').removeClass('bg-success');
            $('#modal_confirm .modal-header').removeClass('bg-danger');
            $('#modal_confirm .modal-header').addClass('bg-warning');
            $('#modal_confirm .modal-body').removeClass('bg-success');
            $('#modal_confirm .modal-body').removeClass('bg-danger');
            $('#modal_confirm .modal-body').addClass('bg-warning');

            // LOADING THE AJAX MODAL
            $('#modal_confirm').modal('show', {backdrop: 'false', keyboard: 'false'});
            $('#modal_confirm .modal-body h3').html(message);
            $('#modal_confirm .modal-title').html(type);

        } else if(type == 'loading' || type == 'Loading') {
            $('#modal_confirm .modal-header').removeClass('bg-danger');
            $('#modal_confirm .modal-header').removeClass('bg-success');
            $('#modal_confirm .modal-header').removeClass('bg-warning');
            $('#modal_confirm .modal-header').addClass('bg-info');
            $('#modal_confirm .modal-body').removeClass('bg-danger');
            $('#modal_confirm .modal-body').removeClass('bg-success');
            $('#modal_confirm .modal-body').removeClass('bg-warning');
            $('#modal_confirm .modal-body').addClass('bg-info');

            // LOADING THE AJAX MODAL
            $('#modal_confirm').modal('show', {backdrop: 'static', keyboard: 'false'});
            $('#modal_confirm .modal-body h3').html(message);
            $('#modal_confirm .modal-title').html(type);
        }

    } 

    function showAjaxModal_loading(message, type)
    {
        // SHOWING AJAX PRELOADER IMAGE

        //change background of modal depending the confirmation type
        if(type == 'success' || type == 'Success') {
            $('#loading .modal-header').removeClass('bg-danger');
            $('#loading .modal-header').addClass('bg-success');
            $('#loading .modal-body').removeClass('bg-danger');
            $('#loading .modal-body').addClass('bg-success');

            // LOADING THE AJAX MODAL
            $('#loading').modal('show', {backdrop: 'false', keyboard: 'false'});
            $('#loading .modal-body h3').html(message);
            $('#loading .modal-title').html(type);

        } else if(type == 'error' || type == 'Error') {
            $('#loading .modal-header').removeClass('bg-success');
            $('#loading .modal-header').addClass('bg-danger');
            $('#loading .modal-body').removeClass('bg-success');
            $('#loading .modal-body').addClass('bg-danger');

            // LOADING THE AJAX MODAL
            $('#loading').modal('show', {backdrop: 'false', keyboard: 'false'});
            $('#loading .modal-body h3').html(message);
            $('#loading .modal-title').html(type);

        } else if(type == 'loading' || type == 'Loading') {
            $('#loading .modal-header').removeClass('bg-danger');
            $('#loading .modal-header').addClass('bg-info');
            $('#loading .modal-body').removeClass('bg-danger');
            $('#loading .modal-body').addClass('bg-info');

            // LOADING THE AJAX MODAL
            $('#loading').modal('show', {backdrop: 'false', keyboard: 'false'});
            $('#loading .modal-body h3').html('<center>' + message + '</center>');
            $('#loading .modal-title').html(type);
        }

    } 

    </script>

    <!-- Logout Modal-->
  <div class="modal fade" id="logoutModal" tabindex="-1" role="dialog" aria-labelledby="exampleModalLabel" aria-hidden="true">
    <div class="modal-dialog" role="document">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title" id="exampleModalLabel">Ready to Leave?</h5>
          <button class="close btn-danger" type="button" data-dismiss="modal" aria-label="Close">
            <span aria-hidden="true"><i class="fa fa-fw fa-md fa-close"></i></span>
          </button>
        </div>
        <div class="modal-body">Select "Logout" below if you are ready to end your current session.</div>
        <div class="modal-footer">

        </div>
      </div>
    </div>
  </div>


   <!-- payments Modal-->
  <div class="modal fade" id="payments" tabindex="-1" role="dialog" aria-labelledby="calendar-modal" aria-hidden="true">
    <div class="modal-dialog" role="document">
      <div class="modal-content">
        <div class="modal-header bg-info">
          <h5 class="modal-title text-light"></h5>
          <button class="close btn-danger" type="button" data-dismiss="modal" aria-label="Close">
            <span aria-hidden="true"><i class="fa fa-fw fa-md fa-close"></i></span>
          </button>
        </div>
        <div class="modal-body">

        </div>
        <div class="modal-footer"><center><small><em>&copy;2018-<?=date('Y');?> Lightworld Technologies Ltd. All rights reserved.</em></small></center></div>
      </div>
    </div>
  </div>

   <!-- main Modal-->
  <div class="modal fade" id="main" tabindex="-1" role="dialog" aria-labelledby="calendar-modal" aria-hidden="true">
    <div class="modal-dialog" role="document">
      <div class="modal-content" style="width: 800px">
        <div class="modal-header bg-info">
          <h5 class="modal-title text-light" id="calendar-modal"></h5>
          <button class="close btn-danger" type="button" data-dismiss="modal" aria-label="Close">
            <span aria-hidden="true"><i class="fa fa-fw fa-md fa-close"></i></span>
          </button>
        </div>
        <div class="modal-body">

        </div>
        <div class="modal-footer row mr-100">
            <div style="text-align: left" class="pr-50">
                <button type="button" class="btn btn-danger btn-lg" data-dismiss="modal"><?php echo get_phrase('close'); ?></button>
            </div>
            <center>
            <small><em>&copy;2018-<?=date('Y');?> Lightworld Technologies Ltd. All rights reserved.</em></small></center></div>
      </div>
    </div>
  </div>

  <!-- data create Modal-->
  <div class="modal fade" id="create" tabindex="-1" role="dialog" aria-labelledby="calendar-modal" aria-hidden="true">
    <div class="modal-dialog" role="document">
      <div class="modal-content">
        <div class="modal-header bg-info">
          <h5 class="modal-title text-light"></h5>
          <button class="close btn-danger" type="button" data-dismiss="modal" aria-label="Close">
            <span aria-hidden="true"><i class="fa fa-fw fa-md fa-close"></i></span>
          </button>
        </div>
        <div class="modal-body">

        </div>
        <div class="modal-footer"><center><small><em>&copy;2018-<?=date('Y');?> Lightworld Technologies Ltd. All rights reserved.</em></small></center></div>
      </div>
    </div>
  </div>

  <!-- proforma invoice create Modal-->
  <div class="modal fade" id="create_proforma_invoice" tabindex="-1" role="dialog" aria-labelledby="calendar-modal" aria-hidden="true">
    <div class="modal-dialog" role="document">
      <div class="modal-content">
        <div class="modal-header bg-info">
          <h5 class="modal-title text-light"></h5>
          <button class="close btn-danger" type="button" data-dismiss="modal" aria-label="Close">
            <span aria-hidden="true"><i class="fa fa-fw fa-md fa-close"></i></span>
          </button>
        </div>
        <div class="modal-body">

        </div>
        <div class="modal-footer"><center><small><em>&copy;2018-<?=date('Y');?> Lightworld Technologies Ltd. All rights reserved.</em></small></center></div>
      </div>
    </div>
  </div>


  <!-- payments_Sales Modal-->
  <div class="modal fade" id="payments_sales" tabindex="-1" role="dialog" aria-labelledby="calendar-modal" aria-hidden="true">
    <div class="modal-dialog" role="document">
      <div class="modal-content">
        <div class="modal-header bg-info">
          <h5 class="modal-title text-light"></h5>
          <button class="close btn-danger" type="button" data-dismiss="modal" aria-label="Close">
            <span aria-hidden="true"><i class="fa fa-fw fa-md fa-close"></i></span>
          </button>
        </div>
        <div class="modal-body">

        </div>
        <div class="modal-footer"><center><small><em>&copy;2018-<?=date('Y');?> Lightworld Technologies Ltd. All rights reserved.</em></small></center></div>
      </div>
    </div>
  </div>

  <!-- success or error Modal-->
  <div class="modal fade" id="modal_confirm" tabindex="-1" role="dialog" aria-labelledby="calendar-modal" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered" role="document" style="margin-top: -100px">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title text-light"></h5>
          <button class="close btn-danger" type="button" data-dismiss="modal" aria-label="Close">
            <span aria-hidden="true"><i class="fa fa-fw fa-md fa-close"></i></span>
          </button>
        </div>
        <div class="modal-body">
            <h3 class="text-light"></h3>
            
        </div>
      </div>
    </div>
  </div>

<div class="modal fade" id="loading" tabindex="-1" role="dialog" aria-labelledby="calendar-modal" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered" role="document" style="margin-top: -100px">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title text-light"></h5>
          <button class="close btn-danger" type="button" data-dismiss="modal" aria-label="Close">
            <span aria-hidden="true"><i class="fa fa-fw fa-md fa-close"></i></span>
          </button>
        </div>
        <div class="modal-body">
            <h3 class="text-light"></h3>
            <div style="text-align:center;margin-top:10px;"><img src="<?php echo base_url(); ?>assets/images/validate.gif" width="34px"/></div>
        </div>
      </div>
    </div>
  </div>






<!--This area to confirm if user really wants to delete a data or not-->

    <script type="text/javascript">
    function confirm_modal(delete_url, message)
    {
        $('#deletion .modal-body strong').html(message);
        $('#deletion').modal('show', {backdrop: 'static'});

        $('#delete_link').click(function(event) {
            /* Act on the event */
            $('#delete_link').attr('data-dismiss', 'modal');

                $.ajax({
                    url: delete_url,
                    type: 'POST',
                    dataType: 'json',
                    cache: false
                })
                .done(function(data) {
                    if(data.success == true) {
                        $('.close').click();
                        showAjaxModal_confirm(data.user + '\'s records deleted Successfully.', 'Success');

                        setTimeout(() => {
                          $('#modal_confirm .close').click(); window.location.reload();
                        }, 3000);
                    } else if(data.success == false) {
                        $('.close').click();
                        showAjaxModal_confirm(data.message, 'Error');

                        $('body').click(function(event) {
                            /* Act on the event */
                            window.location.reload();
                        });

                        /**setTimeout(() => {
                          $('#modal_confirm .close').click();  window.location.reload();
                        }, 6000);**/
                    } else if(data.success == 'order') {
                        $('.close').click();
                        showAjaxModal_confirm(data.message, 'Success');
                        $('body').click(function(event) {
                            /* Act on the event */
                            window.location.reload();
                        });

                        setTimeout(() => {
                          $('#modal_confirm .close').click(); window.location.reload();
                        }, 4000); 
                    }
                })
                .fail(function(err) {
                    $(function(){

                             $('#err').append('<li>' + err.responseText+ '</li>');

                    });
                    showAjaxModal_confirm('Records could not be deleted with Error Message: <ul id="err"></ul>', 'Error');
                    /**setTimeout(() => {
                      $('#modal_confirm .close').click();
                    }, 3000);**/
                });
        });
    }


    function confirm_modal_user(delete_url, modal_type = '')
    {
        if (modal_type === 'generic_confirmation') {
            $('#modal-generic_confirmation').modal('show', {backdrop: 'static'});
            document.getElementById('update_link').setAttribute('href' , delete_url);

        } else if(modal_type === 'modal_block') {
            $('#modal_block').modal('show', {backdrop: 'static'});
            document.getElementById('block_link').setAttribute('href' , delete_url);

        } else if(modal_type === 'modal_unblock') {
            $('#modal_unblock').modal('show', {backdrop: 'static'});
            document.getElementById('unblock_link').setAttribute('href' , delete_url);

        } else if(modal_type === 'user_delete') {
            $('#modal-4').modal('show', {backdrop: 'static'});
            document.getElementById('delete_link_user').setAttribute('href' , delete_url);
        }
       
    }

    function confirm_order(type, customer_id, message, so_code = '')
    {
        $('#creditor_detection .modal-body strong').html(message);
        $('#creditor_detection').modal('show', {backdrop: 'static'});

        $('#detection_link').click(function(event) {
            /* Act on the event */
            $('#detection_link').attr('data-dismiss', 'modal');


                
                if(type == 'negative') {
                    $('.close').click();
                    //for negative balance
                    showAjaxModal_cash_good('<?php echo site_url('modal/popup_sales/cash_goods/'); ?>', customer_id);
                    
                } else if(type == 'goods' && so_code != '') {
                    //for goods
                    showAjaxModal_data_create('<?php echo site_url('modal/popup_sales/payment_with_goods/'); ?>' + so_code + '/' + customer_id, 'Payment With Goods');
                } else {
                    //$('#creditor_detection #detection_link').slideUp('slow');
                    //$('#creditor_detection button').text('CANCEL');
                }

                

                /*setTimeout(() => {
                  $('#modal_confirm .close').click(); window.location.reload();
                }, 3000);*/

                type = '';

        });
    }

    function date_selection_modal(url)
    {
        // SHOWING AJAX PRELOADER IMAGE
        $('#date_selection .modal-body').html('<div style="text-align:center;margin-top:100px;"><img src="assets/images/validate.gif" width="64px" /></div>');

        $('#date_selection .modal-body').html('<div style="text-align:center;margin-top:200px;"><img src="<?php echo base_url(); ?>assets/images/validate.gif" width="64px"/></div>');
        // LOADING THE AJAX MODAL
        $('#date_selection').modal('show', {backdrop: 'false', keyboard: 'false'});

        // SHOW AJAX RESPONSE ON REQUEST SUCCESS
        $.ajax({
            url: url,
            success: function(response)
            {
                $('#date_selection .modal-body').html(response);
            }
        });
    }

    function printer_selection_modal(url)
    {
        // SHOWING AJAX PRELOADER IMAGE
        $('#printer_selection .modal-body').html('<div style="text-align:center;margin-top:100px;"><img src="assets/images/validate.gif" width="64px" /></div>');

        $('#printer_selection .modal-body').html('<div style="text-align:center;margin-top:200px;"><img src="<?php echo base_url(); ?>assets/images/validate.gif" width="64px"/></div>');
        // LOADING THE AJAX MODAL
        $('#printer_selection').modal('show', {backdrop: 'false', keyboard: 'false'});

        // SHOW AJAX RESPONSE ON REQUEST SUCCESS
        $.ajax({
            url: url,
            success: function(response)
            {
                $('#printer_selection .modal-body').html(response);
            }
        });
    }
    </script>



    <!-- (Normal Modal)-->
    <div class="modal fade" id="deletion" tabindex="-1" role="dialog" aria-labelledby="delete-modal" aria-hidden="true">
        <div class="modal-dialog">
            <div class="modal-content" style="margin-top:100px;">

                <div class="modal-header bg-danger">
                    <h3 class="modal-title text-light">Delete Data!!!</h3>
                </div>
                <div class="modal-body"><strong class="text-danger"></strong></div>
                <div class="modal-footer" style="margin:0px; border-top:0px; text-align:center;">
                    <a href="#" class="btn btn-danger btn-lg" id="delete_link"><?php echo get_phrase('delete'); ?></a>
                    <button type="button" class="btn btn-success btn-lg" data-dismiss="modal"><?php echo get_phrase('cancel'); ?></button>
                </div>
            </div>
        </div>
    </div>

     <div class="modal fade" id="date_selection" tabindex="-1" role="dialog" aria-labelledby="date-modal" aria-hidden="true">
        <div class="modal-dialog">
            <div class="modal-content" style="margin-top:100px;">

                <div class="modal-header bg-info">
                    <h3 class="modal-title text-light">Select Date Interval!</h3>
                </div>
                <div class="modal-body"></div>
                <div class="modal-footer" style="margin:0px; border-top:0px; text-align:center;">
                </div>
            </div>
        </div>
    </div>

    <!--for selecting printers-->
    <div class="modal fade" id="printer_selection" tabindex="-1" role="dialog" aria-labelledby="date-modal" aria-hidden="true">
        <div class="modal-dialog">
            <div class="modal-content" style="margin-top:100px;">

                <div class="modal-header bg-info">
                    <h3 class="modal-title text-light">Select Printer!</h3>
                    <button class="close btn-danger" type="button" data-dismiss="modal" aria-label="Close">
                        <span aria-hidden="true"><i class="fa fa-fw fa-md fa-close"></i></span>
                      </button>
                </div>
                <div class="modal-body"></div>
                <div class="modal-footer" style="margin:0px; border-top:0px; text-align:center;">
                </div>
            </div>
        </div>
    </div>

    <!-- (ask if user wants to pay with cash or goods)-->
    <div class="modal fade" id="cash_goods" tabindex="-1" role="dialog" aria-labelledby="cash_goods-modal" aria-hidden="true">
        <div class="modal-dialog">
            <div class="modal-content" style="margin-top:100px;">

                <div class="modal-header bg-success">
                    <h3 class="modal-title text-light">Mode of Payment</h3>
                </div>
                <div class="modal-body"><strong class="text-primary">Do you want to pay this creditor with GOODS or with CASH? Please select your appropriate option below!</strong></div>
                <div class="modal-footer" style="margin:0px; border-top:0px; text-align:center;">
                    
                </div>
            </div>
        </div>
    </div>

    <!-- (ask if user wants to still proceed with overpayment or not)-->
    <div class="modal fade" id="overpayment" tabindex="-1" role="dialog" aria-labelledby="overpayment-modal" aria-hidden="true">
        <div class="modal-dialog">
            <div class="modal-content" style="margin-top:100px;">

                <div class="modal-header bg-danger">
                    <h3 class="modal-title text-light">Over Payment Detected!</h3>
                </div>
                <div class="modal-body bg-danger"><h3 class="text-light"></h3>
                    <hr>
                    <strong class="text-white">Do you still want to proceed?</strong>
                </div>

                    <div class="modal-footer bg-danger" style="margin:0px; border-top:0px; text-align:center;">
                    <a href="#" class="btn btn-danger btn-lg" id="yes_button"><?php echo get_phrase('Yes'); ?></a>
                    <button type="button" class="btn btn-success btn-lg" data-dismiss="modal"><?php echo get_phrase('cancel'); ?></button>
                </div>

            </div>
        </div>
    </div>

    <div class="modal fade" id="creditor_detection" tabindex="-1" role="dialog" aria-labelledby="creditor_detection-modal" aria-hidden="true">
        <div class="modal-dialog">
            <div class="modal-content" style="margin-top:100px;">

                <div class="modal-header bg-danger">
                    <h3 class="modal-title text-light">CREDITOR DETECTED!</h3>
                </div>
                <div class="modal-body"><strong class="text-danger"></strong></div>
                <div class="modal-footer" style="margin:0px; border-top:0px; text-align:center;">
                    <a href="#" class="btn btn-success btn-lg" id="detection_link"><?php echo get_phrase('YES'); ?></a>
                    <button type="button" class="btn btn-danger btn-lg" data-dismiss="modal"><?php echo get_phrase('NO'); ?></button>
                </div>
            </div>
        </div>
    </div>


    <!-- (Normal Modal - delete user)-->

    <div class="modal fade" id="modal-4">
        <div class="modal-dialog">
            <div class="modal-content" style="margin-top:100px;">

                <div class="modal-header bg-danger">
                    <h4 class="modal-title text-white" style="text-align:center;">Are you sure you want to delete this user?</h4>
                </div>


                <div class="modal-footer" style="margin:0px; border-top:0px; text-align:center;">
                    <a href="#" class="btn btn-danger" id="delete_link_user"><?php echo get_phrase('delete');?></a>
                    <button type="button" class="btn btn-success" data-dismiss="modal"><?php echo get_phrase('cancel');?></button>
                </div>
            </div>
        </div>
    </div>

    <!-- (Block Modal)-->
    <div class="modal fade" id="modal_block">
        <div class="modal-dialog">
            <div class="modal-content" style="margin-top:100px;">

                <div class="modal-header" style="background-color: red">
                    <h4 class="modal-title" style="text-align:center; color: #ffffff;"><i class="fa fa-lock"></i> Are you sure you want to BLOCK this user? </h4>
                </div>


                <div class="modal-footer" style="margin:0px; border-top:0px; text-align:center;">
                    <a href="#" class="btn btn-info" id="block_link"><?php echo get_phrase('Yes');?></a>
                    <button type="button" class="btn btn-danger" data-dismiss="modal"><?php echo get_phrase('No');?></button>
                </div>
            </div>
        </div>
    </div>

    

    <!-- (Unblock Modal)-->
    <div class="modal fade" id="modal_unblock">
        <div class="modal-dialog">
            <div class="modal-content" style="margin-top:100px;">

                <div class="modal-header" style="background-color: green">
                    <h4 class="modal-title" style="text-align:center; color: #ffffff;"><i class="fa fa-unlock"></i> Are you sure you want to UNBLOCK this user? </h4>
                </div>


                <div class="modal-footer" style="margin:0px; border-top:0px; text-align:center;">
                    <a href="#" class="btn btn-info" id="unblock_link"><?php echo get_phrase('Yes');?></a>
                    <button type="button" class="btn btn-danger" data-dismiss="modal"><?php echo get_phrase('No');?></button>
                </div>
            </div>
        </div>
    </div>

    <!-- (generic_confirmation Modal)-->
    <div class="modal fade" id="modal-generic_confirmation">
        <div class="modal-dialog">
            <div class="modal-content" style="margin-top:100px;">

                <div class="modal-header">
                    <h4 class="modal-title" style="text-align:center;"><?php echo get_phrase('are_you_sure_you_want_to_update_this_information'); ?> ?</h4>
                </div>


                <div class="modal-footer" style="margin:0px; border-top:0px; text-align:center;">
                    <a href="#" class="btn btn-info" id="update_link"><?php echo get_phrase('yes');?></a>
                    <button type="button" class="btn btn-danger" data-dismiss="modal"><?php echo get_phrase('no');?></button>
                </div>
            </div>
        </div>
    </div>


        <!-- Calendar Modal-->
  <div class="modal fade" id="modal_calendar" tabindex="-1" role="dialog" aria-labelledby="calendar-modal" aria-hidden="true">
    <div class="modal-dialog" role="document">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title" id="calendar-modal"></h5>
          <button class="close btn-info" type="button" data-dismiss="modal" aria-label="Close">
            <span aria-hidden="true"><i class="fa fa-fw fa-md fa-close"></i></span>
          </button>
        </div>
        <div class="modal-body">

        </div>
        <div class="modal-footer"><center><small><em>&copy;2018-<?=date('Y');?> Lightworld Technologies Ltd. All rights reserved.</em></small></center></div>
      </div>
    </div>
  </div>