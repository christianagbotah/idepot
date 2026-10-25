    <script type="text/javascript">


    //called to update the crsf name and key
    $(function(ev) {
      clearUnits();
      //loadUnits();


    });

    var buttonValue = '';

    function toggleItemInUnits(val) {
       
       if(val == 0) {
            $('#item_switch').val(1);
            $('#yesOrNoSelector').text('YES');
            $('#item_units_holder').slideDown('slow');
            $('#yesOrNoSelector').css('color', '#000000');
       } else {
            $('#item_switch').val(0);
            $('#yesOrNoSelector').text('NO');
            $('#item_units_holder').slideUp('slow');
            $('#yesOrNoSelector').css('color', '#b3afaf');
            clearUnits();
       }
    }

    $('#addItemUnits').click(function(e) {
      let item_unit = $('form select[name="item_unit"]').val();
      let unit_total = $('form input[name="unit_total"]').val();
      let unit_price = $('form input[name="unit_price"]').val();
      let timestamp = $('#timestamp').val();
      
      
      if(item_unit == '') {
        $('form select[name="item_unit"]').css({
          borderWidth: '2px',
          borderStyle: 'solid',
          borderColor: 'red'
        });
        return;

      } else {
        $('form select[name="item_unit"]').css({
          borderWidth: '2px',
          borderStyle: 'solid',
          borderColor: 'green'
        });
      }
      if(unit_total == '' || unit_total == 0) {
        $('form input[name="unit_total"]').css({
          borderWidth: '2px',
          borderStyle: 'solid',
          borderColor: 'red'
        });
        return;

      } else {
        $('form input[name="unit_total"]').css({
          borderWidth: '2px',
          borderStyle: 'solid',
          borderColor: 'green'
        });
      }


      if(unit_price == '' || unit_price == 0) {
        $('form input[name="unit_price"]').css({
          borderWidth: '2px',
          borderStyle: 'solid',
          borderColor: 'red'
        });
        return;

      } else {
        $('form input[name="unit_price"]').css({
          borderWidth: '2px',
          borderStyle: 'solid',
          borderColor: 'green'
        });
      }


      $.ajax({
        url: '<?php echo site_url('admin/addItemUnits/create');?>',
        type: 'POST',
        dataType: 'json',
        data: {
          'item_unit': item_unit,
          'unit_total': unit_total,
          'unit_price': unit_price,
          'timestamp': timestamp
        },

        cache: false,
      })
      .done(function(response) {
        //clear the form
        $('form select[name="item_unit"] option:first').prop('selected', true).trigger('change');
        $('form input[name="unit_total"]').val('');
        $('form input[name="unit_price"]').val('');
        
        $('#item_unit').html(response.unit_list);
        $('#units_item_list tbody').html(response.data);
        
      })
      .fail(function(err) {
        $('#units_item_list tbody').html('error here ' + err.responseText);
      })
    });


    //clear all
    function clearUnits() {

          $.ajax({
            url: '<?php echo site_url('admin/addItemUnits/clear/');?>',
            type: 'POST',
            dataType: 'json',
            cache: false,
          })
          .done(function(resp) {
            $('form select[name="item_unit"] option:first').prop('selected', true).trigger('change');
            $('form input[name="unit_total"]').val('');
            $('form input[name="unit_price"]').val('');

            $('#item_unit').html(resp.unit_list);
            $('#units_item_list tbody').html(resp.data);
          })
          .fail(function(err) {
            return;
          })
        }

        function refreshUnits() {

          $.ajax({
            url: '<?php echo site_url('admin/addItemUnits/refresh/');?>',
            type: 'POST',
            dataType: 'json',
            cache: false,
          })
          .done(function(resp) {
            $('form select[name="item_unit"] option:first').prop('selected', true).trigger('change');
            $('form input[name="unit_total"]').val('');
            $('form input[name="unit_price"]').val('');

            $('#item_unit').html(resp.unit_list);
          })
          .fail(function(err) {
            return;
          })
        }

        //clear all
    /*function loadUnits() {

          $.ajax({
            url: '<?php //echo site_url('admin/addItemUnits/load');?>',
            type: 'POST',
            dataType: 'json',
            cache: false,
          })
          .done(function(resp) {

            if(resp.exists) {
              $('#item_switch').val(1);
              $('#yesOrNoSelector').text('YES');
              $('#item_units_holder').slideDown('slow');
              $('#yesOrNoSelector').css('color', '#000000');

              $('#item_unit').html(resp.unit_list);
              $('#units_item_list tbody').html(resp.data);
            }

          })
          .fail(function(err) {
            return;
          })
        }*/

      //Item Creation form submitted
  $('#create_item_form').submit(function(event) {
    /* Act on the event */
    //Scroll to the top
    $('html, body').animate({
        scrollTop: ($('#add_item_top').offset().top )
    }, 1000);

    event.preventDefault();
    //let form_data = $('#create_item_form').serialize(); 

    $('#modal_confirm').attr('data-backdrop', 'static');
    $('#modal_confirm').attr('data-keyboard', 'false');
    showAjaxModal_confirm('Please wait. We are working on it <i class="fa fa-spinner fa-pulse"></i>', 'Loading');

    //send data via ajax
    $.ajax({
      url: '<?php echo site_url('admin/item/create') ?>',
      type: 'POST',
      dataType: 'json',
      data: new FormData(this),
      cache: false,
      contentType: false,
      processData: false
    })
    .done(function(data) {
      if(data.success == true) {
        //$('.close').click();
        showAjaxModal_confirm('Item Added Successfully.', 'Success');


        if(buttonValue == 'save_continue') {

          $('#create_item_form')[0].reset(); //reset form inputs

          $('#item_switch').val(0);
          $('#yesOrNoSelector').text('NO');
          $('#item_units_holder').slideUp('slow');
          $('#yesOrNoSelector').css('color', '#b3afaf');
          $('#units_item_list tbody').html('');

          $('#create_item_form select option:first-child').prop('selected', true).trigger('change');//reset all select elements

          refreshUnits();

          setTimeout(() => {
            $('#modal_confirm .close').click(); 
            //window.location.reload();
          }, 2000);

        } else if(buttonValue == 'save_close') {
          setTimeout(() => {
            //$('.close').click(); 
            window.location.reload();
          }, 500);
        }
        
      } else if(data.success == 'duplicate') {

        $('#modal_confirm').removeAttr('data-backdrop');
        $('#modal_confirm').removeAttr('data-keyboard');

        showAjaxModal_confirm('Duplicate found: Same item\'s name already exists', 'Error');
      } else {

        $('#modal_confirm').removeAttr('data-backdrop');
        $('#modal_confirm').removeAttr('data-keyboard');
        
        $(function(){
          $.each(data, function(index, val) {
          $('#list_err_item_create').append('<li>' + val + '</li>');
        }); });

        //$('.close').click();
        showAjaxModal_confirm('<ul id="list_err_item_create"></ul>', 'Error');
      }
    })
    .fail(function(err) {
      showAjaxModal_confirm(err.responseText, 'Error');
    });
  });

  function saveItem(param) {
      buttonValue = param;
    }
    </script>