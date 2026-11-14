model_name = "codex_test"
remote_dir = "/user/maxim_sidorov"
model_path = remote_dir * "/codex_test.engee"
results_path = remote_dir * "/codex_test_gained_sinus.csv"

try
    engee.close(model_name; force=true)
catch
end

engee.create(model_name)
engee.open(model_name)

engee.add_block("/Basic/Sources/Sine Wave", model_name * "/sinus")
engee.add_block("/Basic/Math Operations/Gain", model_name * "/gained_sinus")
engee.add_block("/Basic/Sinks/Terminator", model_name * "/terminator")

engee.set_param!(
    model_name * "/sinus",
    "Amplitude" => 10.0,
    "Frequency" => 40 * pi,
    "Phase" => 0.0,
    "Bias" => 0.0,
    "SampleTime" => 0.0,
)

engee.set_param!(
    model_name * "/gained_sinus",
    "Gain" => 2 * pi,
)

engee.add_line("sinus/1", "gained_sinus/1")
engee.add_line("gained_sinus/1", "terminator/1")
engee.set_log("gained_sinus/1")

engee.set_param!(
    model_name,
    "StopTime" => 0.2,
    "FixedStep" => 0.0005,
)

engee.arrange_system(engee.gcs())
engee.save(model_name, model_path; force=true)

results = engee.run(model_name)
result_key = first(collect(keys(results)))
df = results[result_key]
times = df.time
values = df.value

open(results_path, "w") do io
    println(io, "time,value")
    for i in eachindex(times)
        println(io, string(times[i], ",", values[i]))
    end
end

println("saved=true")
println("model_path=" * model_path)
println("results_path=" * results_path)
println("result_key=" * string(result_key))
println("rows=" * string(length(times)))
