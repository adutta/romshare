function validateUploadForm() {
  var file = $("#file")[0];
  var name = $("#name")[0];
  var device = $("#device")[0];
  var summary = $("#summary")[0];
  if (name.value == null || name.value == "") {
    alert('Please enter a friendly name for your update.zip.');
    return false;
  }
  if (device && device.value == null || device.value == "" || device.value == "none") {
    alert('Please the target device for your update.zip.');
    return false;
  }
  if (summary.value == null || summary.value == "") {
    alert('Please enter a description for your update.zip.');
    return false;
  }
  if (file && file.value == null || file.value == "") {
    alert('Please select the update.zip to be uploaded.');
    return false;
  }
  return true;
}