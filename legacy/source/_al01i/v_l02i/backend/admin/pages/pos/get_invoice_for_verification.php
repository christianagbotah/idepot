  <?php

    $invoice_code = $this->crud_model->getGeneratedInvoiceCode();

    ?>

  <div class="grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
    <div class="flex w-64">
      <span class="inline-flex items-center px-3 text-lg bg-green-600 border rounded-e-0 border-green-700 border-e-0 rounded-s-md dark:bg-green-500 dark:border-green-400 uppercase text-gray-200">Invoice Code</span>
      
        <input type="text" required="true" style="letter-spacing: 5px;" onkeyup="verify_inv_no_pos()" name="invoice_code_pos" id="invoice_code_pos" minlength="<?php echo strlen($invoice_code); ?>" maxlength="<?php echo strlen($invoice_code); ?>" value="<?= $invoice_code;?>"  class="rounded-none tracking-wider font-bold rounded-e-lg bg-gray-50 border focus:ring-green-400 focus:border-green-400 block min-w-0 w-fit max-w-fit text-lg border-gray-300 pr-3  dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500">
      
    </div>


    <div class="col-span-2">
      <strong id="inv_code_err_message_pos"></strong>
    </div>


    <div class="container col-span-3" style="display: none" id="invoiceReasonRow">
  
    <?php
    echo form_open(site_url('admin/updatesInvoiceCode'), array('class' => 'form-groups-bordered', 'id' => 'updatesInvoiceCode', 'target' => '_top')); ?>

      <div class="flex content-center">
          <div class="flex-auto w-64">
            <textarea class="form-control border-2 border-red-600" name="invoiceReason" id="invoiceReason" placeholder="Enter your reason for not using the recommended invoice code"></textarea>
          </div>

          <div class="flex-none">
            <button type="button" id="submit_invoice_reason" class="ml-3 mt-2 p-3 ring-1 ring-sky-600 bg-sky-400  rounded-md hover:ring-3 text-slate-200 hover:text-white hover:shadow-lg hover:bg-sky-500" onclick="invoiceReasonUpdator($('#invoiceReason').val(), '<?=$invoice_code;?>')">SUBMIT</button>
          </div>
      </div>
    </form>
  </div>

  <script type="text/javascript">
    
    //update reason for not using the invoice code
    function invoiceReasonUpdator(reason, invoice_code) {
      
      if(reason == '') {
        showAjaxModal_confirm('Please specify the reason!', 'Error');
        return;
      }

      if(reason.length < 10) {
        showAjaxModal_confirm('This does not seem to be a valid reason! Make sure you write more than 10 characters.', 'Error');
        return;
      }


      
      $('#submit_invoice_reason').text('Processing..');
      $('#submit_invoice_reason').attr('disabled', 'disabled');

      //do the update now using ajax
      let formUrl = '<?php echo site_url('admin/invoiceReasonUpdator/');?>' + invoice_code;


      $.ajax({
        url: formUrl,
        type: 'post',
        dataType: 'json',
        data: {'reason': reason},
        cache: false,
        
      })
      .done(function(response) {

        if(response.status != 'success') {
          //error
          $(function(ev) {
            $.each(response, function(index, val) {
              $('#response_error_array').append('<li>' + val + '</li>');
            })
          });

          showAjaxModal_confirm('<ul class="list-disc ml-4" id="response_error_array"></ul>', 'Error');

        } else {
          //success
          
         
          showAjaxModal_confirm(response.message, 'success');

          setTimeout(() => {
            getInvoiceCodeSection4Verification();//load new invoice code

            $('.close').click(); //close modal in 3 seconds

          }, 3000);
        }

      })
      .fail(function(err) {

        $('#submit_invoice_reason').removeAttr('disabled');
        $('#submit_invoice_reason').text('SUBMIT');

        showAjaxModal_confirm('SOMETHING HAPPENED:<br/>' + err.responseText, 'Error');
      })


    }
    
  </script>