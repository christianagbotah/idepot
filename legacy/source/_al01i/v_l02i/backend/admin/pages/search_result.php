<hr />
<div class="row">
    <div class="col-md-12">

      <table class="table table-bordered datatable" id="table_export">
          <thead>
              <tr>
                  <th width="80"><div>Date</div></th>
                  <th width="80"><div>So_code</div></th>
                  <th><div>Customer</div></th>
                  <th class="span3"><div>Invoice Code</div></th>
                  <th><div>Waybill Code</div></th>
              </tr>
          </thead>
          <tbody>
              <?php
                      foreach($search_information as $row):
                        $customer_id = $this->db->get_where('sales_order', ['so_code' => $row['so_code']])->row()->customer_id;
                        $customer_name = $this->db->get_where('customers', ['customer_id' => $customer_id])->row()->customer_name;
                      ?>
              <tr>
                  <td><?php echo $row['date']?></td>
                  <td><a href="javascript:void(0);" onclick="showAjaxModal_data_create('<?php echo site_url('modal/popup_sales/preview_order/'.$row['so_code']); ?>', 'Preview Sales Order')"><?=$row['so_code'] ?></a></td>
                  <td><?=$customer_name; ?></td>
                  <td><?=$row['invoice_code'] ?></td>
                  <td><?=$row['waybill_code'] ?></td>
                  
              </tr>
              <?php endforeach;?>
          </tbody>
      </table>
    </div>
</div>



<!-----  DATA TABLE EXPORT CONFIGURATIONS ---->
<script type="text/javascript">
/**
	jQuery(document).ready(function($)
	{


		var datatable = $("#table_export").dataTable({
			"sPaginationType": "bootstrap",
			"sDom": "<'row'<'col-xs-3 col-left'l><'col-xs-9 col-right'<'export-data'T>f>r>t<'row'<'col-xs-3 col-left'i><'col-xs-9 col-right'p>>",
			"oTableTools": {
        "sSwfPath": "<?php echo base_url(); ?>assets/js/datatables/copy_csv_xls_pdf.swf",
				"aButtons": [

					{
						"sExtends": "xls",
						"mColumns": [0, 2, 3, 4]
					},
					{
						"sExtends": "pdf",
						"mColumns": [0, 2, 3, 4]
					},
					{
						"sExtends": "print",
						"fnSetText"	   : "Press 'esc' to return",
						"fnClick": function (nButton, oConfig) {
							datatable.fnSetColumnVis(1, false);
							datatable.fnSetColumnVis(5, false);

							this.fnPrint( true, oConfig );

							window.print();

							$(window).keyup(function(e) {
								  if (e.which == 27) {
									  datatable.fnSetColumnVis(1, true);
									  datatable.fnSetColumnVis(5, true);
								  }
							});
						},

					},
				]
			},

		});

		$(".dataTables_wrapper select").select2({
			minimumResultsForSearch: -1
		});
	});
**/
</script>
