/* بيانات تجريبية أولية — تُنشأ مرة واحدة عند أول تشغيل، وتُزاح تواريخها لتكون نسبية لليوم */
(() => {
'use strict';
const Q = window.Q;
const REF = new Date('2026-09-29T11:50:00+03:00');

Q.seed = (data) => {
  const SHIFT = Date.now() - REF.getTime();
  const D = s => new Date(new Date(s + ':00+03:00').getTime() + SHIFT).toISOString();
  const addD = (iso, days, hours = 0) => new Date(new Date(iso).getTime() + days * Q.DAY + hours * Q.HOUR).toISOString();
  let seed = 20260929; const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const pick = a => a[Math.floor(rnd() * a.length)];
  const between = (a, b) => a + Math.floor(rnd() * (b - a + 1));

  data.settings = Q.defaultSettings();
  data.settings.surveyDate = addD(D('2026-09-29T09:00'), 130);

  /* departments */
  data.depts = [
    ['nicu', 'العناية المركزة لحديثي الولادة', 'Neonatal ICU', 'حديثي الولادة', 'NICU'],
    ['icu', 'العناية المركزة للبالغين', 'Adult ICU', 'العناية المركزة', 'ICU'],
    ['er', 'الطوارئ', 'Emergency', 'الطوارئ', 'ED'],
    ['surg', 'التنويم الجراحي', 'Surgical ward', 'الجراحي', 'Surgical'],
    ['med', 'التنويم الباطني', 'Medical ward', 'الباطني', 'Medical'],
    ['or', 'غرف العمليات', 'Operating rooms', 'العمليات', 'OR'],
    ['lab', 'المختبر', 'Laboratory', 'المختبر', 'Lab'],
    ['rad', 'الأشعة', 'Radiology', 'الأشعة', 'Radiology'],
    ['pharm', 'الصيدلية', 'Pharmacy', 'الصيدلية', 'Pharmacy'],
    ['qps', 'إدارة الجودة وسلامة المرضى', 'Quality & Patient Safety', 'الجودة', 'QPS'],
    ['biomed', 'الهندسة الطبية الحيوية', 'Biomedical engineering', 'الهندسة الطبية', 'Biomed'],
    ['it', 'تقنية المعلومات', 'Information technology', 'التقنية', 'IT']
  ].map(([id, ar, en, sar, sen]) => ({id, name: {ar, en}, short: {ar: sar, en: sen}}));

  /* users */
  data.users = [
    ['u1', 'سارة النعيمي', 'Sarah Alnuaimi', 'director', 'qps', 'sarah.n'],
    ['u2', 'هند الدوسري', 'Hind Aldosari', 'qps', 'qps', 'hind.d'],
    ['u3', 'د. ريم الحربي', 'Dr. Reem Alharbi', 'supervisor', 'nicu', 'reem.h'],
    ['u4', 'أمل السبيعي', 'Amal Alsubaie', 'supervisor', 'icu', 'amal.s'],
    ['u5', 'د. سامي عارف', 'Dr. Sami Aref', 'supervisor', 'er', 'sami.a'],
    ['u6', 'نورة العتيبي', 'Noura Alotaibi', 'supervisor', 'surg', 'noura.o'],
    ['u7', 'د. فهد القحطاني', 'Dr. Fahad Alqahtani', 'supervisor', 'rad', 'fahad.q'],
    ['u8', 'عبدالله الشهري', 'Abdullah Alshehri', 'supervisor', 'or', 'abdullah.s'],
    ['u9', 'سلوى أحمد', 'Salwa Ahmed', 'supervisor', 'lab', 'salwa.a'],
    ['u10', 'د. ماجد العمري', 'Dr. Majed Alomari', 'supervisor', 'pharm', 'majed.o'],
    ['u11', 'م. خالد سعد', 'Eng. Khalid Saad', 'biomed', 'biomed', 'khalid.s'],
    ['u12', 'منى الزهراني', 'Mona Alzahrani', 'reporter', 'icu', 'mona.z'],
    ['u13', 'ريم الغامدي', 'Reem Alghamdi', 'reporter', 'nicu', 'reem.g'],
    ['u14', 'فيصل الحارثي', 'Faisal Alharthi', 'admin', 'it', 'faisal.h'],
    ['u15', 'لمى الشمري', 'Lama Alshammari', 'reporter', 'er', 'lama.s'],
    ['u16', 'هيا الدوسري', 'Haya Aldosari', 'reporter', 'pharm', 'haya.d'],
    ['u17', 'د. عمر باسلامة', 'Dr. Omar Baslamah', 'supervisor', 'med', 'omar.b']
  ].map(([id, ar, en, role, deptId, mail]) => ({id, name: {ar, en}, role, deptId, email: `${mail}@alsalam-hospital.sa`, active: true, createdAt: D('2026-01-04T09:00')}));
  data.depts.forEach(d => { const h = data.users.find(u => u.deptId === d.id && ['supervisor', 'director', 'biomed', 'admin'].includes(u.role)); d.headId = h ? h.id : null; });
  const sup = dept => (data.users.find(u => u.deptId === dept && u.role === 'supervisor') || {id: 'u1'}).id;

  /* incident types */
  data.types = [
    ['t-med', 'خطأ دوائي', 'Medication error', 'medication'], ['t-fall', 'سقوط مريض', 'Patient fall', 'clinical'], ['t-device', 'عطل جهاز طبي', 'Medical device', 'device'],
    ['t-ipc', 'مكافحة العدوى', 'Infection control', 'ipc'], ['t-id', 'تحديد هوية المريض', 'Patient identification', 'clinical'], ['t-care', 'تأخر أو قصور في الرعاية', 'Delay or gap in care', 'clinical'],
    ['t-skin', 'قرحة فراش أو إصابة جلدية', 'Pressure / skin injury', 'clinical'], ['t-staff', 'إصابة موظف', 'Staff injury', 'staff'], ['t-supply', 'نقص مستلزمات', 'Supply shortage', 'facility'],
    ['t-lab', 'خطأ في العينات المخبرية', 'Specimen error', 'clinical'], ['t-iv', 'مضاعفات قسطرة وريدية', 'IV line complication', 'clinical'], ['t-sec', 'سلوك عنيف أو حادث أمني', 'Violence / security', 'facility'], ['t-other', 'أخرى', 'Other', 'other']
  ].map(([id, ar, en, cat]) => ({id, name: {ar, en}, cat, active: true}));

  /* live incidents */
  const I = [];
  const mk = o => { I.push(Object.assign({anonymous: false, affected: 'in', patient: null, attachments: [], factors: []}, o)); };
  const rv = (at, by, sev, lik, cls, factors, ownerId, notes = '') => ({at, by, sev, lik, classification: cls, factors, ownerId, causesBy: sev * lik >= 15 || cls === 'sentinel' ? 'rca' : 'dept', notes});
  mk({id: 'OVR-2026-1048', typeId: 't-med', deptId: 'nicu', title: {ar: 'جرعة جنتاميسين أعلى من الموصوفة', en: 'Gentamicin dose above prescription'}, occurredAt: D('2026-09-28T17:50'), reportedAt: D('2026-09-28T18:25'), reporterId: 'u13', anonymous: true, location: 'حاضنة 4', reporterSentinel: true,
    patient: {mrn: '1184206', name: 'رضيع — أسرة المطيري', age: '9 أيام', sex: 'M'},
    desc: 'رضيع عمره 9 أيام (2.1 كجم) تلقى جرعة جنتاميسين وريدية تعادل أربعة أضعاف الجرعة الموصوفة. حُضّرت الجرعة من عبوة 40 مجم/مل بدل عبوة 10 مجم/مل المخصصة لحديثي الولادة. اكتُشف الخطأ عند مراجعة الصيدلي السريري للسجل بعد 15 دقيقة.',
    immediate: 'إيقاف أي جرعات لاحقة، سحب مستوى الدواء في الدم، إشعار الطبيب المناوب وطبيب الكلى، وإبلاغ الأسرة وفق سياسة الإفصاح.',
    stage: 'rca', supervisor: {by: 'u3', at: D('2026-09-28T18:40'), comment: 'حدث جسيم. أُبلغ الرئيس التنفيذي هاتفيًا الساعة 18:38. التركيزان مخزنان في الدرج نفسه.', causes: 'تشابه العبوات، تحضير أثناء تسليم المناوبة.', prevention: 'فصل التراكيز وإلزام التحقق المزدوج المستقل.', ceoInformed: true},
    review: rv(D('2026-09-28T19:05'), 'u2', 5, 4, 'sentinel', ['staff', 'equipment', 'env', 'policy', 'comm'], 'u3', 'يُفتح تحقيق RCA فورًا. الإخطار الخارجي مستحق خلال 24 ساعة من وقت الحدث.'), rcaId: 'RCA-2026-031'});
  mk({id: 'OVR-2026-1047', typeId: 't-med', deptId: 'pharm', title: {ar: 'صرف هيبارين بتركيز مختلف — اكتُشف قبل التسليم', en: 'Heparin wrong strength picked — caught before release'}, occurredAt: D('2026-09-29T08:20'), reportedAt: D('2026-09-29T08:55'), reporterId: 'u16', location: 'صيدلية التنويم', affected: 'other',
    desc: 'التُقطت عبوة هيبارين 5000 وحدة/مل بدل 1000 وحدة/مل من الرف أثناء تجهيز طلب للتنويم الباطني، واكتُشف الخطأ في التحقق النهائي قبل خروج الطلب.', immediate: 'تصحيح الصرف وإعادة ترتيب الرف مؤقتًا.', stage: 'new'});
  mk({id: 'OVR-2026-1045', typeId: 't-care', deptId: 'er', title: {ar: 'انتظار مريض 3 ساعات لسرير تنويم', en: 'Patient waited 3 hours for inpatient bed'}, occurredAt: D('2026-09-28T22:10'), reportedAt: D('2026-09-29T01:30'), reporterId: 'u15', location: 'منطقة الملاحظة', patient: {mrn: '1210877', name: '', age: '64', sex: 'F'},
    desc: 'مريضة مقبولة في التنويم الباطني بقيت في منطقة الملاحظة 3 ساعات و20 دقيقة بعد قرار التنويم بسبب عدم توفر سرير، دون تدهور في العلامات الحيوية.', immediate: 'متابعة العلامات الحيوية كل 30 دقيقة وإبلاغ منسق الأسرّة.', stage: 'new'});
  mk({id: 'OVR-2026-1042', typeId: 't-device', deptId: 'icu', title: {ar: 'توقف مفاجئ في جهاز تنفس صناعي', en: 'Unexpected ventilator stoppage'}, occurredAt: D('2026-09-27T14:05'), reportedAt: D('2026-09-27T14:30'), reporterId: 'u12', location: 'سرير 7', deviceTag: 'VEN-ICU-07', patient: {mrn: '1093377', name: '', age: '58', sex: 'M'},
    desc: 'أطلق جهاز التنفس في السرير 7 إنذار انخفاض ضغط ثم توقف لمدة 40 ثانية تقريبًا. استُخدم جهاز التنفس اليدوي فورًا ولم تنخفض نسبة الأكسجين عن 91%.', immediate: 'استبدال الجهاز، عزله بملصق "خارج الخدمة"، وإبلاغ الهندسة الطبية الحيوية.',
    stage: 'rca', supervisor: {by: 'u4', at: D('2026-09-27T15:00'), comment: 'الجهاز خضع لصيانة وقائية في يونيو. لم يتأذَّ المريض.', causes: 'عطل محتمل في مستشعر التدفق.', prevention: 'فحص جميع الأجهزة من الطراز نفسه.', ceoInformed: false},
    review: rv(D('2026-09-28T09:30'), 'u2', 4, 4, 'incident', ['equipment', 'info'], 'u11'), rcaId: 'RCA-2026-030'});
  mk({id: 'OVR-2026-1039', typeId: 't-fall', deptId: 'surg', title: {ar: 'سقوط دون إصابة', en: 'Fall without injury'}, occurredAt: D('2026-09-27T21:05'), reportedAt: D('2026-09-27T21:40'), reporterId: 'u6', location: 'غرفة 214', patient: {mrn: '1201158', name: '', age: '71', sex: 'F'},
    desc: 'مريضة (71 عامًا) انزلقت أثناء توجهها لدورة المياه دون طلب المساعدة. لا توجد إصابة ظاهرة بعد الفحص.', immediate: 'فحص الطبيب المناوب، إعادة تقييم خطر السقوط (Morse 55)، وتفعيل جرس الاستدعاء بجانب السرير.',
    stage: 'review', supervisor: {by: 'u6', at: D('2026-09-28T08:10'), comment: 'المريضة مصنفة عالية الخطورة للسقوط لكن لم يُفعّل إنذار السرير.', causes: 'عدم تفعيل إنذار مغادرة السرير.', prevention: 'تدقيق يومي على مرضى Morse ≥ 45.', ceoInformed: false}});
  mk({id: 'OVR-2026-1036', typeId: 't-skin', deptId: 'icu', title: {ar: 'قرحة فراش من الدرجة الثانية', en: 'Stage 2 pressure injury'}, occurredAt: D('2026-09-26T06:15'), reportedAt: D('2026-09-26T09:00'), reporterId: 'u12', location: 'سرير 3', patient: {mrn: '1077412', name: '', age: '77', sex: 'M'},
    desc: 'رُصدت قرحة من الدرجة الثانية في منطقة العجز لمريض منوّم منذ 8 أيام، ولم يُوثّق تغيير الوضعية في آخر مناوبتين.', immediate: 'تركيب مرتبة هوائية، جدول تقليب كل ساعتين، واستشارة فريق العناية بالجروح.',
    stage: 'review', supervisor: {by: 'u4', at: D('2026-09-26T12:20'), comment: 'نقص في التوثيق خلال المناوبات الليلية.', causes: 'ضغط العمل، غياب تذكير آلي للتقليب.', prevention: 'إضافة تذكير في السجل الإلكتروني.', ceoInformed: false}});
  mk({id: 'OVR-2026-1031', typeId: 't-care', deptId: 'er', title: {ar: 'تأخر استجابة طبية لحالة متدهورة', en: 'Delayed response to deteriorating patient'}, occurredAt: D('2026-09-25T11:20'), reportedAt: D('2026-09-25T12:05'), reporterId: 'u15', location: 'سرير 12', patient: {mrn: '1210935', name: '', age: '49', sex: 'M'},
    desc: 'استغرق حضور الطبيب المقيم 27 دقيقة بعد نداء التمريض لمريض بدرجة إنذار مبكر 7.', immediate: 'تصعيد مباشر لاستشاري الطوارئ وبدء بروتوكول التدهور السريري.',
    stage: 'action', supervisor: {by: 'u5', at: D('2026-09-25T14:00'), comment: 'الطبيب المقيم كان في إنعاش حالة أخرى.', causes: 'تغطية غير كافية وقت الذروة.', prevention: 'مسار تصعيد مكتوب.', ceoInformed: false},
    review: rv(D('2026-09-26T10:00'), 'u2', 3, 4, 'incident', ['staff', 'comm', 'coord'], 'u5')});
  mk({id: 'OVR-2026-1024', typeId: 't-supply', deptId: 'or', title: {ar: 'نفاد مستلزمات جراحية حرجة', en: 'Critical surgical supply stock-out'}, occurredAt: D('2026-09-23T09:45'), reportedAt: D('2026-09-23T10:30'), reporterId: 'u8', affected: 'property', location: 'غرفة 3',
    desc: 'تأجلت عمليتان مجدولتان 90 دقيقة بسبب نفاد دبابيس التدبيس الجراحي مقاس 60 مم.', immediate: 'استعارة كمية من مستشفى الشبكة وإبلاغ إدارة الإمداد.',
    stage: 'action', supervisor: {by: 'u8', at: D('2026-09-23T12:00'), comment: 'لا يوجد حد أدنى مُعرّف للمخزون.', causes: 'غياب تنبيه آلي.', prevention: 'تحديد حد أدنى.', ceoInformed: false},
    review: rv(D('2026-09-24T09:00'), 'u2', 3, 3, 'incident', ['coord', 'info'], 'u8')});
  mk({id: 'OVR-2026-1018', typeId: 't-staff', deptId: 'lab', title: {ar: 'وخز إبرة لموظف', en: 'Needlestick injury'}, occurredAt: D('2026-09-21T16:10'), reportedAt: D('2026-09-21T16:30'), reporterId: 'u9', affected: 'staff', location: 'غرفة سحب الدم',
    desc: 'تعرّض فني مختبر لوخز إبرة أثناء التخلص من أنبوب سحب دم في حاوية ممتلئة فوق الحد.', immediate: 'غسل الموضع، إحالة لصحة الموظفين، وسحب عينات المصدر وفق البروتوكول.',
    stage: 'action', supervisor: {by: 'u9', at: D('2026-09-21T17:30'), comment: 'الحاوية لم تُستبدل في موعدها.', causes: 'جدول الاستبدال غير واضح.', prevention: 'استبدال الحاويات عند ¾.', ceoInformed: false},
    review: rv(D('2026-09-22T10:00'), 'u2', 3, 2, 'incident', ['env', 'policy'], 'u9')});
  mk({id: 'OVR-2026-1011', typeId: 't-id', deptId: 'rad', title: {ar: 'إجراء أشعة لمريض غير المقصود', en: 'Imaging performed on the wrong patient'}, occurredAt: D('2026-09-14T10:30'), reportedAt: D('2026-09-14T11:05'), reporterId: 'u7', affected: 'out', patient: {mrn: '1150264', name: '', age: '38', sex: 'M'},
    desc: 'أُجريت أشعة مقطعية بالصبغة لمريض يحمل الاسم الأول نفسه لمريض آخر في قائمة الانتظار. لم تظهر مضاعفات للصبغة.', immediate: 'مراقبة المريض ساعتين، إفصاح للمريض، وإجراء الفحص للمريض الصحيح.',
    stage: 'rca', supervisor: {by: 'u7', at: D('2026-09-14T12:00'), comment: 'النداء بالاسم الأول ممارسة شائعة في القسم.', causes: 'عدم مطابقة المعرّفين.', prevention: 'نقطة تحقق قبل الفحص.', ceoInformed: true},
    review: rv(D('2026-09-15T09:00'), 'u2', 5, 3, 'incident', ['policy', 'comm', 'staff'], 'u7'), rcaId: 'RCA-2026-028'});
  mk({id: 'OVR-2026-1007', typeId: 't-med', deptId: 'pharm', title: {ar: 'التباس بين دواءين متشابهين في الاسم', en: 'Look-alike/sound-alike drug mix-up'}, occurredAt: D('2026-09-10T13:15'), reportedAt: D('2026-09-10T13:40'), reporterId: 'u16', affected: 'other',
    desc: 'صُرف هيدرالازين بدل هيدروكسيزين واكتُشف عند التحقق قبل التسليم.', immediate: 'تصحيح الصرف وإبلاغ لجنة الدواء.',
    stage: 'closed', supervisor: {by: 'u10', at: D('2026-09-10T15:00'), comment: 'الدواءان متجاوران على الرف.', causes: 'تخزين متجاور.', prevention: 'Tall-Man.', ceoInformed: false},
    review: rv(D('2026-09-11T09:00'), 'u2', 1, 4, 'near', ['equipment', 'env'], 'u10'), closure: {at: D('2026-09-24T12:00'), by: 'u2', feedback: 'شكرًا على الإبلاغ. فُصل تخزين الدواءين وأضيفت ملصقات Tall-Man.', onTime: true}});
  mk({id: 'OVR-2026-0996', typeId: 't-iv', deptId: 'nicu', title: {ar: 'تسرّب محلول وريدي', en: 'IV extravasation'}, occurredAt: D('2026-09-02T04:40'), reportedAt: D('2026-09-02T05:10'), reporterId: 'u13',
    desc: 'تورّم بسيط في موضع القسطرة الطرفية لرضيع، أُوقف التسريب مبكرًا.', immediate: 'إزالة القسطرة ورفع الطرف ومتابعة الموضع كل ساعة.',
    stage: 'closed', supervisor: {by: 'u3', at: D('2026-09-02T08:00'), comment: 'اكتُشف مبكرًا.', causes: 'عدم انتظام فحص الموضع.', prevention: 'فحص كل ساعة.', ceoInformed: false},
    review: rv(D('2026-09-03T09:00'), 'u2', 2, 2, 'incident', ['staff'], 'u3'), closure: {at: D('2026-09-20T12:00'), by: 'u2', feedback: 'اعتُمد بروتوكول الفحص كل ساعة.', onTime: true}});
  I.forEach(x => { x.createdAt = x.reportedAt; });

  /* historical (archived) incidents — 12 months of closed reports so reports & charts reflect data */
  const TREND = [[7,4,1],[9,3,2],[8,5,1],[10,4,2],[9,6,1],[11,5,2],[9,5,2],[11,4,1],[8,6,3],[12,5,2],[10,7,2],[13,8,3]];
  const LOWC = [[1,1],[1,2],[1,3],[1,4],[1,5],[2,1],[2,2]], MEDC = [[2,3],[2,4],[3,2],[3,3],[3,4],[4,2],[4,3],[2,5]], HIGHC = [[4,4],[5,3],[3,5],[4,5],[5,4]];
  const TPL = {
    't-med': [['تأخير جرعة مضاد حيوي', 'Delayed antibiotic dose'], ['نسيان جرعة دواء', 'Missed dose'], ['وصفة بجرعة غير واضحة', 'Ambiguous prescription'], ['صرف دواء لمريض آخر — اكتُشف قبل الإعطاء', 'Wrong patient dispensing — caught']],
    't-fall': [['سقوط من السرير', 'Fall from bed'], ['انزلاق في الممر', 'Slip in corridor'], ['سقوط أثناء النقل', 'Fall during transfer']],
    't-device': [['عطل مضخة تسريب', 'Infusion pump fault'], ['إنذار خاطئ في شاشة مراقبة', 'False monitor alarm'], ['بطارية جهاز منتهية', 'Depleted device battery']],
    't-ipc': [['عدم الالتزام بعزل التلامس', 'Contact isolation breach'], ['تأخر تعقيم أدوات', 'Delayed instrument sterilisation']],
    't-id': [['سوار تعريف غير مطابق', 'Mismatched ID band'], ['عينة بدون ملصق', 'Unlabelled specimen']],
    't-care': [['تأخر نتيجة حرجة', 'Delayed critical result'], ['تأخر نقل مريض', 'Delayed patient transfer'], ['عدم توثيق خطة الرعاية', 'Care plan not documented']],
    't-skin': [['احمرار جلدي من الدرجة الأولى', 'Stage 1 pressure injury']],
    't-staff': [['إصابة ظهر أثناء نقل مريض', 'Back strain during transfer'], ['رذاذ سوائل في العين', 'Splash to the eye']],
    't-supply': [['نفاد قفازات مقاس صغير', 'Small gloves out of stock'], ['تأخر توريد محاليل', 'Delayed IV fluid delivery']],
    't-lab': [['عينة متحللة', 'Haemolysed sample'], ['تأخر وصول عينة', 'Delayed specimen transport']],
    't-iv': [['التهاب موضع القسطرة', 'Phlebitis at cannula site']],
    't-sec': [['اعتداء لفظي على موظف', 'Verbal abuse of staff']],
    't-other': [['تسرب مياه في الممر', 'Water leak in corridor']]
  };
  const TYPEW = ['t-med','t-med','t-med','t-fall','t-fall','t-device','t-ipc','t-id','t-care','t-care','t-skin','t-staff','t-supply','t-lab','t-iv','t-sec','t-other'];
  const DEPTW = ['nicu','icu','icu','er','er','er','surg','surg','med','med','or','lab','rad','pharm'];
  const staffOf = d => { const us = data.users.filter(u => u.deptId === d); return (us.length ? pick(us) : pick(data.users)).id; };
  const hist = [];
  const refMonth = new Date(new Date(D('2026-09-29T11:50')).getFullYear(), new Date(D('2026-09-29T11:50')).getMonth(), 1);
  const liveCount = [0, 0, 0]; I.forEach(x => { const s = x.review ? x.review.sev * x.review.lik : 4; const b = x.review && x.review.classification === 'sentinel' || s >= 15 ? 2 : s >= 6 ? 1 : 0; if (x.id !== 'OVR-2026-1047' && x.id !== 'OVR-2026-1045') liveCount[b]++; });
  let seq = 996 - 1;
  const usedCur = new Set(I.map(x => +x.id.slice(-4)));
  let curSeq = 997;
  for (let m = 0; m < 12; m++) {
    const monthStart = new Date(refMonth.getFullYear(), refMonth.getMonth() - (11 - m), 1);
    const isCur = m === 11;
    const want = TREND[m].map((n, b) => isCur ? Math.max(0, n - liveCount[b]) : n);
    const recs = [];
    want.forEach((n, b) => { for (let i = 0; i < n; i++) recs.push(b); });
    recs.forEach(b => {
      const typeId = pick(TYPEW), deptId = pick(DEPTW);
      const days = isCur ? between(0, 23) : between(0, 27);
      const occ = new Date(monthStart.getTime() + days * Q.DAY + between(6, 22) * Q.HOUR + between(0, 59) * 6e4);
      const [sev, lik] = pick(b === 0 ? LOWC : b === 1 ? MEDC : HIGHC);
      const rep = new Date(occ.getTime() + between(15, 180) * 6e4);
      const supAt = new Date(rep.getTime() + between(2, 30) * Q.HOUR);
      const revAt = new Date(supAt.getTime() + between(1, 4) * Q.DAY);
      const closeDays = b === 2 ? between(28, 55) : between(8, 50);
      const closeAt = new Date(rep.getTime() + closeDays * Q.DAY);
      const open = isCur && closeAt > new Date() && rnd() < .5;
      if (!open && closeAt > new Date()) closeAt.setTime(Math.max(rep.getTime() + 2 * Q.DAY, Date.now() - between(1, 5) * Q.DAY));
      if (closeAt < revAt) closeAt.setTime(revAt.getTime() + Q.DAY);
      const t = pick(TPL[typeId]);
      const n = isCur ? (() => { while (usedCur.has(curSeq)) curSeq++; usedCur.add(curSeq); return curSeq++; })() : null;
      hist.push({_n: n, _occ: occ, typeId, deptId, title: {ar: t[0], en: t[1]}, occurredAt: occ.toISOString(), reportedAt: rep.toISOString(), createdAt: rep.toISOString(), reporterId: staffOf(deptId), anonymous: rnd() < .25,
        affected: typeId === 't-staff' ? 'staff' : typeId === 't-supply' ? 'property' : 'in', patient: null, attachments: [], location: '',
        desc: {ar: `${t[0]}. سُجّل البلاغ من ${data.depts.find(d => d.id === deptId).name.ar}.`, en: `${t[1]}. Reported from ${data.depts.find(d => d.id === deptId).name.en}.`}, immediate: 'اتُّخذ الإجراء الفوري المناسب وأُبلغ المشرف.',
        stage: open ? 'action' : 'closed', archived: true,
        supervisor: {by: sup(deptId), at: supAt.toISOString(), comment: 'تمت مراجعة الحدث مع الفريق.', causes: '', prevention: '', ceoInformed: b === 2},
        review: {at: revAt.toISOString(), by: 'u2', sev, lik, classification: sev === 1 ? 'near' : 'incident', factors: Object.keys(Q.FACTORS).filter(() => rnd() < .22).slice(0, 3), ownerId: sup(deptId), causesBy: b === 2 ? 'rca' : 'dept', notes: ''},
        closure: open ? null : {at: closeAt.toISOString(), by: 'u2', feedback: 'أُبلغ المبلّغ بنتيجة المراجعة والإجراءات المتخذة.', onTime: (closeAt - rep) / Q.DAY <= 45}});
    });
  }
  hist.filter(h => h._n == null).sort((a, b) => a._occ - b._occ).forEach((h, i, arr) => { h._n = 996 - (arr.length - i); });
  hist.forEach(h => { const y = new Date(h.occurredAt).getFullYear(); h.id = `OVR-${y}-${String(h._n).padStart(4, '0')}`; delete h._n; delete h._occ; });
  data.incidents = [...I, ...hist];

  /* RCA */
  const ev = (t, text, key) => ({id: Q.uid('e'), at: D(t), text, key: !!key});
  data.rca = [
    {id: 'RCA-2026-031', incidentId: 'OVR-2026-1048', status: 'forming', leadId: 'u3', team: ['u3', 'u2', 'u10', 'u13', 'u4', 'u1'], createdAt: D('2026-09-28T19:10'), meetingAt: null, meetingPlan: D('2026-10-03T10:00'),
      events: [ev('2026-09-28T16:30', 'وُصف جنتاميسين 5 مجم/كجم (10.5 مجم) كل 36 ساعة.'), ev('2026-09-28T17:05', 'الصيدلية صرفت الجرعة من مخزون الوحدة دون تحضير مركزي.'), ev('2026-09-28T17:35', 'حُضّرت الجرعة من عبوة 40 مجم/مل أثناء تسليم المناوبة.', 1), ev('2026-09-28T17:50', 'أُعطيت الجرعة بعد تحقق شفهي فقط.', 1), ev('2026-09-28T18:05', 'الصيدلي السريري لاحظ عدم تطابق الحجم المسجل.'), ev('2026-09-28T18:25', 'تسجيل البلاغ وإشعار المشرف والرئيس التنفيذي.')],
      whys: [['لماذا تلقى الرضيع جرعة أعلى؟', 'سُحبت الجرعة من تركيز 40 مجم/مل بدل 10 مجم/مل.'], ['لماذا كان التركيز الأعلى متاحًا؟', 'يُخزَّن التركيزان في الدرج نفسه وبعبوات متشابهة الشكل.'], ['لماذا لم يكشفه التحقق المزدوج؟', 'تم التحقق شفهيًا أثناء التسليم دون رؤية العبوة.'], ['لماذا كان التحقق شفهيًا؟', 'المناوبة المسائية كانت بتغطية 61% من الخطة.'], ['لماذا لم يُعالج نقص التغطية؟', 'لا توجد قاعدة تصعيد عند انخفاض التغطية عن حد أدنى.']].map(([q, a]) => ({q, a})),
      fish: {staff: 'تغطية 61%، تسليم مناوبة متزامن مع التحضير', equipment: 'عبوتان متشابهتان بتركيزين مختلفين', env: 'مقاطعات متكررة أثناء التحضير', policy: 'التحقق المزدوج غير مُلزم في السجل الإلكتروني', comm: 'تسليم شفهي غير منظم'},
      rootCause: 'غياب ضوابط تمنع توفر تراكيز البالغين في وحدة حديثي الولادة، مع ضغط تشغيلي أضعف التحقق المزدوج.'},
    {id: 'RCA-2026-030', incidentId: 'OVR-2026-1042', status: 'analysis', leadId: 'u11', team: ['u11', 'u4', 'u2', 'u12'], createdAt: D('2026-09-28T09:40'), meetingAt: null, meetingPlan: D('2026-10-02T14:30'),
      events: [ev('2026-09-27T13:50', 'فحص روتيني للجهاز دون ملاحظات.'), ev('2026-09-27T14:03', 'إنذار انخفاض ضغط متكرر.', 1), ev('2026-09-27T14:05', 'توقف الجهاز 40 ثانية تقريبًا.', 1), ev('2026-09-27T14:06', 'بدء التنفس اليدوي واستبدال الجهاز.'), ev('2026-09-27T14:30', 'تسجيل البلاغ وعزل الجهاز.')],
      whys: [['لماذا توقف الجهاز؟', 'قراءة خاطئة من مستشعر التدفق أدت لإيقاف وقائي.'], ['لماذا أعطى المستشعر قراءة خاطئة؟', 'رطوبة متراكمة في خط المستشعر.'], ['لماذا تراكمت الرطوبة؟', 'لم يُستبدل الفلتر وفق جدول الشركة المصنعة.']].map(([q, a]) => ({q, a})),
      fish: {equipment: 'مستشعر التدفق والفلتر', info: 'تحذير المصنع الأخير لم يُعمم على الوحدة', policy: 'جدول استبدال الفلاتر قديم'},
      rootCause: 'قيد التحقق: فجوة بين جدول استبدال الفلاتر المعتمد في الوحدة وتوصيات الشركة المصنعة.'},
    {id: 'RCA-2026-028', incidentId: 'OVR-2026-1011', status: 'report', leadId: 'u7', team: ['u7', 'u1', 'u2', 'u15', 'u14'], createdAt: D('2026-09-15T09:10'), meetingAt: D('2026-09-17T11:00'), meetingPlan: D('2026-09-17T11:00'),
      events: [ev('2026-09-14T10:05', 'وصول مريضين بالاسم الأول نفسه لقسم الأشعة.'), ev('2026-09-14T10:20', 'نداء المريض بالاسم الأول فقط.', 1), ev('2026-09-14T10:30', 'إجراء الفحص دون مطابقة رقم الملف.', 1), ev('2026-09-14T10:55', 'اكتشاف الخطأ عند ربط الصور بالطلب.')],
      whys: [['لماذا أُجري الفحص للمريض الخطأ؟', 'لم يُطابق رقم الملف مع السوار.'], ['لماذا لم تتم المطابقة؟', 'النداء بالاسم الأول عرف سائد في القسم.'], ['لماذا أصبح عرفًا؟', 'سياسة التعرف لا تحدد نقطة التحقق قبل الفحص.']].map(([q, a]) => ({q, a})),
      fish: {policy: 'لا توجد نقطة تحقق إلزامية قبل الفحص', comm: 'النداء بالاسم الأول', staff: 'فني جديد في أسبوعه الثاني', env: 'ازدحام قائمة الانتظار'},
      rootCause: 'سياسة التعرف على المريض لا تُلزم بنقطة تحقق قبل الإجراءات التشخيصية.'}
  ];

  /* CAPA */
  const C = (id, incidentId, title, ownerId, due, progress, status, extra = {}) => Object.assign({id, incidentId, rcaId: (data.rca.find(r => r.incidentId === incidentId) || {}).id || null, title, ownerId, deptId: (data.users.find(u => u.id === ownerId) || {}).deptId, due: D(due), progress, status, kind: 'corrective', source: incidentId ? 'ovr' : 'audit', createdAt: D('2026-09-15T10:00'), createdBy: 'u2', updates: []}, extra);
  data.capa = [
    C('CAPA-311', 'OVR-2026-1011', 'اعتماد التحقق من معرّفين (الاسم + رقم الملف) بصوت مسموع قبل كل فحص أشعة', 'u7', '2026-09-21T12:00', 70, 'progress', {updates: [{at: D('2026-09-19T10:00'), by: 'u7', text: 'تم تدريب 14 من 20 فنيًا.', progress: 70}]}),
    C('CAPA-305', 'OVR-2026-1031', 'مراجعة توزيع مناوبات الأطباء المقيمين في الطوارئ خلال فترة الذروة', 'u5', '2026-09-26T12:00', 40, 'progress'),
    C('CAPA-309', null, 'تحديث نموذج تسليم المناوبة التمريضية ليشمل الأدوية عالية الخطورة', 'u4', '2026-09-27T12:00', 85, 'progress', {source: 'audit'}),
    C('CAPA-315', 'OVR-2026-1042', 'فحص احترازي لكل أجهزة التنفس من الطراز نفسه (4 أجهزة)', 'u11', '2026-10-03T12:00', 50, 'progress', {kind: 'preventive'}),
    C('CAPA-313', 'OVR-2026-1018', 'تدريب فريق المختبر على التخلص الآمن من الأدوات الحادة واستبدال الحاويات عند ثلاثة أرباعها', 'u9', '2026-10-05T12:00', 60, 'progress'),
    C('CAPA-314', 'OVR-2026-1031', 'اعتماد مسار تصعيد مكتوب عند درجة إنذار مبكر ≥ 5', 'u5', '2026-10-06T12:00', 20, 'progress', {kind: 'preventive'}),
    C('CAPA-312', 'OVR-2026-1024', 'تحديد حد أدنى للمخزون مع تنبيه آلي لمستلزمات غرف العمليات الحرجة', 'u8', '2026-10-12T12:00', 0, 'open', {kind: 'preventive'}),
    C('CAPA-316', 'OVR-2026-1048', 'فصل تخزين تراكيز الجنتاميسين للبالغين عن وحدة حديثي الولادة بالكامل', 'u10', '2026-10-06T12:00', 0, 'draft'),
    C('CAPA-317', 'OVR-2026-1048', 'تحقق مزدوج مستقل وموثّق في السجل الإلكتروني للأدوية عالية الخطورة', 'u3', '2026-10-13T12:00', 0, 'draft'),
    C('CAPA-318', 'OVR-2026-1048', 'قاعدة تصعيد تلقائية عند انخفاض تغطية الكادر عن 75%', 'u1', '2026-10-20T12:00', 0, 'draft', {kind: 'preventive'}),
    C('CAPA-301', 'OVR-2026-1007', 'فصل تخزين الأدوية متشابهة الأسماء واستخدام ملصقات Tall-Man', 'u10', '2026-09-24T12:00', 100, 'verified', {doneAt: D('2026-09-20T12:00'), verify: {at: D('2026-09-23T12:00'), by: 'u2', effective: true, note: 'جولة تدقيق: لا ملاحظات.'}}),
    C('CAPA-306', 'OVR-2026-0996', 'تحديث بروتوكول متابعة موضع القسطرة الطرفية كل ساعة لحديثي الولادة', 'u3', '2026-09-18T12:00', 100, 'verified', {doneAt: D('2026-09-16T12:00'), verify: {at: D('2026-09-19T12:00'), by: 'u2', effective: true, note: 'اعتُمد البروتوكول.'}}),
    C('CAPA-319', 'OVR-2026-1024', 'مراجعة شهرية لاستهلاك المستلزمات الجراحية مع الإمداد', 'u8', '2026-10-20T12:00', 100, 'done', {doneAt: D('2026-09-28T12:00')})
  ];

  /* KPIs */
  const cur = Q.ym(D('2026-09-29T11:50'));
  const months = Array.from({length: 9}, (_, i) => Q.ymAdd(cur, i - 8));
  const K = (id, code, ar, en, deptId, unit, dir, target, warn, numD, denD, series) => ({k: {id, code, name: {ar, en}, deptId, unit, dir, target, warn, num: numD, den: denD, active: true}, series});
  const kp = [
    K('k1', 'KPI-01', 'نسبة توفر الكادر', 'Staff availability', 'nicu', 'pct', 'up', 80, 60, 'الكادر الفعلي', 'الكادر حسب الخطة', [[36,36],[36,36],[36,36],[36,36],[25,36],[25,36],[22,36],[22,36],[22,36]]),
    K('k2', 'KPI-02', 'نسبة توفر المستلزمات', 'Supply availability', 'nicu', 'pct', 'up', 80, 60, 'الأصناف المصروفة', 'الأصناف المطلوبة', [[201,210],[201,210],[194,200],[194,200],[190,200],[190,200],[190,200],[190,200],[190,200]]),
    K('k3', 'KPI-03', 'تأخر رد الأطباء على نداء التمريض', 'Delayed physician response to nurse calls', 'nicu', 'pct', 'down', 1, 10, 'نداءات تأخر ردها > 10 دقائق', 'إجمالي النداءات', [[0,38],[0,35],[0,40],[0,44],[0,39],[0,36],[0,42],[0,40],[0,41]]),
    K('k4', 'KPI-04', 'نسبة الوفيات', 'Mortality', 'nicu', 'pct', 'down', 1, 2, 'حالات الوفاة', 'حالات الخروج', [[0,19],[0,21],[0,17],[2,18],[2,22],[0,20],[0,19],[0,23],[0,18]]),
    K('k5', 'KPI-05', 'العودة غير المخططة للعناية', 'Unplanned return to NICU', 'nicu', 'pct', 'down', 1, 2, 'حالات العودة', 'حالات الخروج', [[0,19],[1,57],[0,17],[0,18],[0,22],[0,20],[0,19],[0,23],[0,18]]),
    K('k6', 'KPI-06', 'معدل سقوط المرضى', 'Patient falls', 'nicu', 'per1000', 'down', 0, 1, 'حوادث السقوط', 'أيام التنويم', [[0,420],[0,398],[0,431],[0,405],[0,440],[0,416],[0,409],[0,422],[0,412]]),
    K('k7', 'KPI-07', 'نسبة الأخطاء الدوائية (C–F)', 'Medication errors (C–F)', 'nicu', 'pct', 'down', 0, 1, 'أخطاء دوائية مُبلّغ عنها', 'حالات الخروج', [[0,19],[0,21],[0,17],[0,18],[0,22],[1,18],[0,19],[0,23],[1,18]]),
    K('k8', 'KPI-08', 'متوسط مدة الإقامة', 'Average length of stay', 'nicu', 'days', 'down', 5, 7, 'مجموع أيام الرعاية', 'حالات الخروج', [[76,19],[147,21],[153,17],[252,18],[242,22],[100,20],[76,19],[230,23],[72,18]]),
    K('k9', 'KPI-09', 'صعوبة تركيب القسطرة الوريدية', 'Difficult cannulation', 'nicu', 'pct', 'down', 0, 2, 'استدعاء ممرض/طبيب خبير', 'إجمالي محاولات التركيب', [[0,61],[0,55],[0,58],[0,60],[0,64],[0,52],[0,59],[0,61],[0,57]]),
    K('k10', 'IPC-01', 'الالتزام بنظافة الأيدي', 'Hand hygiene compliance', 'qps', 'pct', 'up', 90, 80, 'فرص ملتزم بها', 'فرص مُلاحظة', [[171,200],[176,200],[180,200],[183,200],[178,200],[181,200],[176,200],[179,200],[176,200]]),
    K('k11', 'ED-02', 'فحص المريض خلال 30 دقيقة من الفرز', 'Seen within 30 min of triage', 'er', 'pct', 'up', 85, 70, 'مرضى فُحصوا خلال 30 دقيقة', 'إجمالي مرضى المستوى 3', [[1340,1610],[1298,1575],[1352,1590],[1310,1620],[1288,1660],[1301,1602],[1276,1648],[1332,1630],[1205,1452]])
  ];
  data.kpis = kp.map(x => x.k);
  data.kpiValues = [];
  kp.forEach(({k, series}) => series.forEach(([num, den], i) => data.kpiValues.push({id: `${k.id}:${months[i]}`, kpiId: k.id, month: months[i], num, den, by: k.deptId === 'nicu' ? 'u3' : 'u2', at: D('2026-09-05T10:00')})));

  /* CBAHI standards */
  const E = (ar, en, status, ownerId, extra = {}) => Object.assign({id: Q.uid('el'), text: {ar, en}, status, ownerId, files: [], note: ''}, extra);
  const FILE = (name, size, by, at) => [{id: Q.uid('f'), name, size, type: 'application/pdf', by, at: D(at), demo: true}];
  data.standards = [
    {id: 'QM.13', chapter: 'QM', priority: 'high', name: {ar: 'إدارة الأحداث الجسيمة', en: 'Sentinel event management'}, note: 'سياسة التصعيد غير معتمدة بعد، ومحضر لجنة الجودة لشهر أغسطس غير مرفق.', elements: [
      E('سياسة الإبلاغ عن الأحداث الجسيمة', 'Sentinel event reporting policy', 'approved', 'u2', {files: FILE('QPS-POL-013 Sentinel event policy.pdf', 412000, 'u2', '2026-06-02T10:00')}),
      E('سجل الأحداث الجسيمة 2026', '2026 sentinel event log', 'approved', 'u2', {files: FILE('Sentinel event log 2026.pdf', 188000, 'u2', '2026-09-01T10:00')}),
      E('اعتماد سياسة التصعيد من المدير الطبي', 'Escalation policy sign-off', 'missing', 'u1', {due: D('2026-10-10T12:00')}),
      E('محضر لجنة الجودة — أغسطس', 'Quality Committee minutes — August', 'missing', 'u2', {due: D('2026-10-05T12:00')}),
      E('نموذج تقرير RCA المعتمد', 'Approved RCA report template', 'approved', 'u2', {files: FILE('RCA template v3.pdf', 96000, 'u2', '2026-05-11T10:00')}),
      E('دليل الإخطار خلال 24 ساعة لآخر حدث', '24-hour notification proof for last event', 'uploaded', 'u2', {files: FILE('SPSC notification.pdf', 72000, 'u2', '2026-09-16T10:00')})]},
    {id: 'MM.9', chapter: 'MM', priority: 'high', name: {ar: 'تخزين الأدوية عالية الخطورة', en: 'High-alert medication storage'}, note: 'التحقيق في OVR-2026-1048 كشف تخزين تركيزين للجنتاميسين في درج واحد.', elements: [
      E('قائمة الأدوية عالية الخطورة', 'High-alert drug list', 'approved', 'u10', {files: FILE('High-alert list 2026.pdf', 140000, 'u10', '2026-03-12T10:00')}),
      E('جولة تدقيق التخزين — NICU', 'Storage audit round — NICU', 'missing', 'u10', {due: D('2026-10-04T12:00')}),
      E('فصل التراكيز حسب الوحدة', 'Concentration segregation by unit', 'missing', 'u10', {due: D('2026-10-06T12:00')}),
      E('ملصقات التحذير على الأرفف', 'Shelf warning labels', 'approved', 'u10', {files: FILE('Shelf label photos.pdf', 1840000, 'u10', '2026-04-20T10:00')})]},
    {id: 'FMS.11', chapter: 'FMS', priority: 'high', name: {ar: 'الصيانة الوقائية للأجهزة الطبية', en: 'Medical equipment preventive maintenance'}, note: 'جهاز إزالة رجفان في العمليات تجاوز موعد الصيانة الوقائية.', elements: [
      E('جدول الصيانة الوقائية السنوي', 'Annual PM schedule', 'approved', 'u11', {files: FILE('PM schedule 2026.pdf', 256000, 'u11', '2026-01-15T10:00')}),
      E('سجل صيانة DEF-OR-02', 'PM record for DEF-OR-02', 'missing', 'u11', {due: D('2026-09-30T12:00')}),
      E('سجل الاستدعاءات والتحذيرات', 'Recalls & alerts log', 'approved', 'u11', {files: FILE('Recalls log.pdf', 88000, 'u11', '2026-08-30T10:00')}),
      E('تقرير الربع الثالث', 'Q3 maintenance report', 'missing', 'u11', {due: D('2026-10-08T12:00')})]},
    {id: 'QM.12', chapter: 'QM', priority: 'normal', name: {ar: 'برنامج سلامة المرضى', en: 'Patient safety program'}, note: 'تحديث سجل المخاطر وخطة التوعية الفصلية قيد المراجعة.', elements: [
      E('خطة سلامة المرضى 2026', '2026 patient safety plan', 'approved', 'u1', {files: FILE('PS plan 2026.pdf', 530000, 'u1', '2026-01-20T10:00')}),
      E('سجل المخاطر المحدّث', 'Updated risk register', 'uploaded', 'u2', {files: FILE('Risk register Q3.pdf', 210000, 'u2', '2026-09-25T10:00')}),
      E('جولات القيادة (Leadership rounds)', 'Leadership safety rounds', 'approved', 'u1', {files: FILE('Rounds Q3.pdf', 120000, 'u1', '2026-09-10T10:00')}),
      E('خطة التوعية الفصلية', 'Quarterly awareness plan', 'missing', 'u2')]},
    {id: 'IPSG.1', chapter: 'IPSG', priority: 'high', name: {ar: 'التعرف الصحيح على هوية المريض', en: 'Correct patient identification'}, note: 'بانتظار نتائج تدقيق الأشعة بعد تطبيق التحقق من معرّفين.', elements: [
      E('سياسة التعرف على المريض', 'Patient ID policy', 'approved', 'u2', {files: FILE('IPSG-1 policy.pdf', 160000, 'u2', '2026-02-02T10:00')}),
      E('تدقيق الالتزام — الأشعة', 'Compliance audit — Radiology', 'uploaded', 'u7', {files: FILE('Radiology ID audit Sep.pdf', 98000, 'u7', '2026-09-27T10:00')}),
      E('سجل التدريب', 'Training log', 'approved', 'u2', {files: FILE('Training log.pdf', 76000, 'u2', '2026-08-12T10:00')})]},
    {id: 'IPC.4', chapter: 'IPC', priority: 'normal', name: {ar: 'نظافة الأيدي', en: 'Hand hygiene'}, note: 'نسبة الالتزام 88% في آخر تدقيق؛ الهدف 90%.', elements: [
      E('نتائج التدقيق الشهري', 'Monthly audit results', 'approved', 'u2', {files: FILE('HH audit Aug.pdf', 110000, 'u2', '2026-09-03T10:00')}),
      E('خطة التحسين', 'Improvement plan', 'approved', 'u2', {files: FILE('HH improvement.pdf', 90000, 'u2', '2026-07-01T10:00')}),
      E('تدقيق سبتمبر', 'September audit', 'missing', 'u2', {due: D('2026-10-05T12:00')})]},
    {id: 'QM.7', chapter: 'QM', priority: 'normal', name: {ar: 'قياس مؤشرات الأداء', en: 'Performance measurement'}, note: 'المؤشرات موثقة ومحدثة ومرفقة بمحاضر المراجعة.', elements: [
      E('بطاقات تعريف المؤشرات', 'Indicator definition cards', 'approved', 'u2', {files: FILE('KPI cards.pdf', 330000, 'u2', '2026-01-10T10:00')}),
      E('لوحة المؤشرات الشهرية', 'Monthly dashboard', 'approved', 'u2', {files: FILE('Dashboard Aug.pdf', 410000, 'u2', '2026-09-05T10:00')}),
      E('محاضر المراجعة', 'Review minutes', 'approved', 'u1', {files: FILE('KPI review minutes.pdf', 64000, 'u1', '2026-09-08T10:00')})]},
    {id: 'LD.6', chapter: 'LD', priority: 'normal', name: {ar: 'خطة التوظيف', en: 'Staffing plan'}, note: 'الخطة معتمدة، ويلزم ربطها بقاعدة التصعيد المقترحة في CAPA-318.', elements: [
      E('خطة التوظيف المعتمدة', 'Approved staffing plan', 'approved', 'u1', {files: FILE('Staffing plan 2026.pdf', 280000, 'u1', '2026-01-05T10:00')}),
      E('مصفوفة الكفاءات', 'Competency matrix', 'approved', 'u1', {files: FILE('Competency matrix.pdf', 150000, 'u1', '2026-03-05T10:00')})]},
    {id: 'MOI.3', chapter: 'MOI', priority: 'normal', name: {ar: 'سرية المعلومات الصحية', en: 'Health information confidentiality'}, note: 'كل الأدلة مستوفاة ومراجعة في يوليو.', elements: [
      E('سياسة الخصوصية', 'Privacy policy', 'approved', 'u14', {files: FILE('Privacy policy.pdf', 120000, 'u14', '2026-07-01T10:00')}),
      E('تقرير صلاحيات الوصول', 'Access rights report', 'approved', 'u14', {files: FILE('Access review Q2.pdf', 84000, 'u14', '2026-07-12T10:00')})]}
  ];

  /* devices & maintenance */
  const DV = (id, ar, en, model, serial, deptId, loc, status, lastPM, pmMonths, vendor, note = '') => ({id, name: {ar, en}, model, serial, deptId, location: loc, status, lastPM: D(lastPM), pmMonths, vendor, note, createdAt: D('2025-11-01T09:00')});
  data.devices = [
    DV('VEN-ICU-07', 'جهاز تنفس صناعي', 'Ventilator', 'Hamilton C6', 'HC6-20-11873', 'icu', 'سرير 7', 'down', '2026-06-14T09:00', 6, 'الشركة الوطنية للتجهيزات الطبية', 'بانتظار لوحة المستشعر من الوكيل.'),
    DV('VEN-ICU-03', 'جهاز تنفس صناعي', 'Ventilator', 'Hamilton C6', 'HC6-20-11861', 'icu', 'سرير 3', 'check', '2026-06-14T09:00', 6, 'الشركة الوطنية للتجهيزات الطبية', 'فحص احترازي — نفس الدفعة التصنيعية.'),
    DV('MON-ER-21', 'شاشة مراقبة العلامات الحيوية', 'Patient monitor', 'Philips IntelliVue MX450', 'DE7214-0932', 'er', 'منطقة الإنعاش', 'repair', '2026-04-02T09:00', 6, 'فيليبس السعودية', 'فقدان متقطع لإشارة SpO₂.'),
    DV('DEF-OR-02', 'جهاز إزالة الرجفان', 'Defibrillator', 'ZOLL R Series', 'AF12C0-4471', 'or', 'غرفة 2', 'ok', '2026-03-20T09:00', 6, 'زول الشرق الأوسط', 'الصيانة الوقائية متأخرة.'),
    DV('INF-NICU-12', 'مضخة تسريب', 'Infusion pump', 'B. Braun Infusomat Space', '1428836', 'nicu', 'حاضنة 4', 'ok', '2026-04-04T09:00', 6, 'بي براون', 'مكتبة الأدوية محدثة (إصدار 14).'),
    DV('INC-NICU-04', 'حاضنة أطفال', 'Incubator', 'Dräger Babyleo TN500', 'ASKM-0197', 'nicu', 'حاضنة 4', 'ok', '2026-05-20T09:00', 6, 'دريغر'),
    DV('ECG-SURG-05', 'جهاز تخطيط القلب', 'ECG machine', 'GE MAC 2000', 'SCD1908-221', 'surg', 'محطة التمريض', 'ok', '2026-07-08T09:00', 12, 'جي إي للرعاية الصحية'),
    DV('SUC-OR-06', 'جهاز شفط جراحي', 'Surgical suction', 'Medela Dominant Flex', 'MD-55120', 'or', 'غرفة 6', 'ok', '2026-08-02T09:00', 12, 'ميديلا'),
    DV('XR-RAD-01', 'جهاز أشعة سينية متنقل', 'Mobile X-ray', 'Siemens Mobilett Mira Max', 'SMM-3309', 'rad', 'الأشعة', 'ok', '2026-02-11T09:00', 12, 'سيمنز هيلثينيرز'),
    DV('BLD-LAB-02', 'ثلاجة حفظ الدم', 'Blood bank refrigerator', 'Helmer iB111', 'HLM-77801', 'lab', 'بنك الدم', 'ok', '2026-06-30T09:00', 6, 'هيلمر')
  ];
  data.maint = [
    {id: Q.uid('m'), deviceId: 'VEN-ICU-07', kind: 'repair', at: D('2026-09-27T16:00'), by: 'u11', text: 'فحص أولي: خطأ في قراءة مستشعر التدفق. طُلبت لوحة المستشعر من الوكيل.', result: 'pending'},
    {id: Q.uid('m'), deviceId: 'VEN-ICU-07', kind: 'pm', at: D('2026-06-14T09:00'), by: 'u11', text: 'صيانة وقائية نصف سنوية. اجتاز الاختبارات.', result: 'pass'},
    {id: Q.uid('m'), deviceId: 'MON-ER-21', kind: 'repair', at: D('2026-09-24T11:00'), by: 'u11', text: 'استبدال كابل SpO₂ لم يحل المشكلة، الجهاز مرسل للوكيل.', result: 'pending'},
    {id: Q.uid('m'), deviceId: 'DEF-OR-02', kind: 'pm', at: D('2026-03-20T09:00'), by: 'u11', text: 'اختبار الطاقة والبطارية — ناجح.', result: 'pass'},
    {id: Q.uid('m'), deviceId: 'INF-NICU-12', kind: 'inspection', at: D('2026-08-15T09:00'), by: 'u11', text: 'تحديث مكتبة الأدوية إلى الإصدار 14.', result: 'pass'}
  ];

  /* comments */
  data.comments = [
    {id: Q.uid('c'), ref: 'OVR-2026-1048', by: 'u1', at: D('2026-09-29T07:40'), text: 'تم التواصل مع الأسرة صباح اليوم. أرجو تجهيز مسودة الإخطار الخارجي قبل الظهر.'},
    {id: Q.uid('c'), ref: 'OVR-2026-1048', by: 'u10', at: D('2026-09-29T09:15'), text: 'سُحبت عبوات 40 مجم/مل من مخزون الوحدة بالكامل كإجراء مؤقت.'},
    {id: Q.uid('c'), ref: 'OVR-2026-1042', by: 'u11', at: D('2026-09-28T13:00'), text: 'الوكيل أكد وجود تحذير فني على دفعة المستشعرات نفسها.'}
  ];

  /* audit trail for live records */
  data.audit = [];
  const A = (entity, ref, action, by, at, detail = '') => data.audit.push({id: Q.uid('a'), entity, ref, action, by, at, detail});
  I.forEach(x => {
    A('incident', x.id, 'submitted', x.reporterId, x.reportedAt);
    if (x.supervisor) A('incident', x.id, 'supervised', x.supervisor.by, x.supervisor.at);
    if (x.review) A('incident', x.id, 'reviewed', x.review.by, x.review.at, `SAL ${x.review.sev * x.review.lik}`);
    if (x.rcaId) A('incident', x.id, 'rca_opened', x.review.by, addD(x.review.at, 0, .1), x.rcaId);
    if (x.closure) A('incident', x.id, 'closed', x.closure.by, x.closure.at);
  });
  (data.capa || []).forEach(c => A('capa', c.id, 'created', c.createdBy, c.createdAt));
  Q.bilingualize(data);
};

/* bilingual pass: pair every seeded Arabic text with its English version (also migrates older saved data) */
Q.bilingualize = (data) => {
  const EN = window.SEED_EN || {};
  const B = v => typeof v === 'string' && EN[v] ? {ar: v, en: EN[v]} : v;
  const fx = (o, keys) => { if (o) keys.forEach(k => { o[k] = B(o[k]); }); };
  (data.incidents || []).forEach(x => { if (x.archived && typeof x.desc === 'string') { const m = /^(.*)\. سُجّل البلاغ من (.*)\.$/.exec(x.desc); const d = (data.depts || []).find(z => z.name && z.name.ar === (m && m[2])); const tt = x.title && x.title.en; if (m && tt) x.desc = {ar: x.desc, en: `${tt}. Reported from ${d ? d.name.en : m[2]}.`}; }
    fx(x, ['desc', 'immediate', 'location']); fx(x.patient, ['name', 'age']); fx(x.supervisor, ['comment', 'causes', 'prevention']); fx(x.review, ['notes']); fx(x.closure, ['feedback']); });
  (data.rca || []).forEach(r => { r.events.forEach(e => fx(e, ['text'])); r.whys.forEach(w => fx(w, ['q', 'a'])); fx(r.fish, Object.keys(r.fish || {})); fx(r, ['rootCause']); });
  (data.capa || []).forEach(c => { fx(c, ['title']); (c.updates || []).forEach(u => fx(u, ['text'])); fx(c.verify, ['note']); });
  (data.standards || []).forEach(st => { fx(st, ['note']); st.elements.forEach(e => fx(e, ['note'])); });
  (data.devices || []).forEach(d => fx(d, ['location', 'note', 'vendor']));
  (data.maint || []).forEach(m => fx(m, ['text'])); (data.comments || []).forEach(c => fx(c, ['text'])); (data.kpis || []).forEach(k => fx(k, ['num', 'den']));
};
})();
