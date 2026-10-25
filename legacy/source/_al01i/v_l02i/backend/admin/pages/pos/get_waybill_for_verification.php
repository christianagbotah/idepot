  <?php

$waybill_code = $this->crud_model->getGeneratedWaybillCode($customer_id, $useSameWaybillCode);
$rowQuery = customerAlreadyPickedPayablesTodayQuery($customer_id);

?>

    <div class="input-group">
      <div class="input-group-prepend">
          <div class="input-group-text bg-info text-light font-bold">WAYBILL CODE</div>
      </div>
      <input type="text" onkeyup="verify_waybill_code()" title="<?php echo $waybill_code; ?>" required="required" class="form-control" name="waybill_code" id="waybill_code" minlength="<?php echo strlen($waybill_code); ?>" maxlength="<?php echo strlen($waybill_code); ?>" value="<?php echo $waybill_code; ?>">
    </div>

    <div class="col-sm-12 col-md-12">
      <strong id="waybill_code_err_message_pos"></strong>
    </div>

    <div class="container" style="<?=$rowQuery->num_rows() > 0 ? '' : 'display: none';?>" id="useSameWaybillCodeHolder">
      <ul class="list-group">

        <li class="list-group-item row">

          <label for="useSameWaybillCode" id="useSameWaybillCodeLabel" class="control-label" style="cursor: pointer;">Use the same code?</label>


          <div class="switch-button pull-right showcase-switch-button">
            <input type="checkbox"  value="<?=$useSameWaybillCode;?>"  checked name="useSameWaybillCode" id="useSameWaybillCode" onchange="updateWaybillCode(<?=$customer_id;?>, $(this).val())">
            <label for="useSameWaybillCode"></label>
          </div>
        </li>

      </ul>
    </div>

  <div class="container" style="display: none" id="waybillReasonRow">

    <?php
echo form_open(site_url('admin/updatesWaybillCode'), array('class' => 'form-groups-bordered', 'id' => 'updatesWaybillCode', 'target' => '_top')); ?>

      <div class="flex content-center">
          <div class="flex-auto w-64">
            <textarea class="form-control border-2 border-red-600" name="waybillReason" id="waybillReason" placeholder="Enter your reason for not using the recommended waybill code"></textarea>
          </div>

          <div class="flex-none">
            <button type="button" id="submit_waybill_reason" class="ml-3 mt-2 p-3 ring-1 ring-sky-600 bg-sky-400  rounded-md hover:ring-3 text-slate-200 hover:text-white hover:shadow-lg hover:bg-sky-500" onclick="waybillReasonUpdator($('#waybillReason').val(), '<?=$waybill_code;?>')">SUBMIT</button>
          </div>
      </div>
    </form>
  </div>

  <script type="text/javascript">

    //update reason for not using the waybill code
    function waybillReasonUpdator(reason, waybill_code) {

      showAjaxModal_confirm('Please wait...<i class="fa fa-spinner fa-pulse"></i>', 'Loading');

      if(reason == '') {
        showAjaxModal_confirm('Please specify the reason!', 'Error');
        return;
      }

      if(reason.length < 10) {
        showAjaxModal_confirm('This does not seem to be a valid reason! Make sure you write more than 10 characters.', 'Error');
        return;
      }



      $('#submit_waybill_reason').text('Processing..');
      $('#submit_waybill_reason').attr('disabled', 'disabled');

      //do the update now using ajax
      let formUrl = '<?php echo site_url('admin/waybillReasonUpdator/'); ?>' + waybill_code;


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

            getWaybillCodeSection4Verification(<?=$customer_id;?>);//load new waybill code

            $('#modal_confirm .close').click(); //close modal in 3 seconds

          }, 3000);
        }

      })
      .fail(function(err) {

        $('#submit_waybill_reason').removeAttr('disabled');
        $('#submit_waybill_reason').text('SUBMIT');

        showAjaxModal_confirm('SOMETHING HAPPENED:<br/>' + err.responseText, 'Error');
      })


    }

    function updateWaybillCode(customer_id, useSameWaybillCode) {

      if(useSameWaybillCode == 'yes') {

        $('#useSameWaybillCode').val('no');

      } else {

        $('#useSameWaybillCode').val('yes');

      }

      let useSameWaybillCodeVal = $('#useSameWaybillCode').val();

      getWaybillCodeSection4Verification(customer_id, useSameWaybillCodeVal);

    }

  </script>